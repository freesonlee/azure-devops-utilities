import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule, MatTabGroup } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { TerraformPlanService } from '../../services/terraform-plan.service';
import { TerraformSensitivityService } from '../../services/terraform-sensitivity.service';
import { TerraformPlan, ResourceSummary, ResourceChange, ModuleGroup, ResourceTypeGroup, IteratorGroup, PathSegmentGroup, ConstructNode } from '../../interfaces/terraform-plan.interface';
import * as Diff from 'diff';
import { ResourceListComponent } from './resource-list.component';
import { ConstructViewComponent } from './construct-view.component';

@Component({
    selector: 'app-terraform-plan-display',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatTabsModule,
        MatIconModule,
        MatChipsModule,
        MatExpansionModule,
        MatButtonModule,
        MatTableModule,
        MatToolbarModule,
        MatInputModule,
        MatFormFieldModule,
        MatProgressBarModule,
        MatSidenavModule,
        MatDividerModule,
        MatTooltipModule,
        MatSlideToggleModule,
        MatSnackBarModule,
        ClipboardModule,
        ResourceListComponent,
        ConstructViewComponent
    ],
    providers: [TerraformPlanService],
    templateUrl: './terraform-plan-display.component.html',
    styleUrl: './terraform-plan-display.component.scss'
})
export class TerraformPlanDisplayComponent implements OnInit, OnChanges {
    @ViewChild('tabGroup') tabGroup!: MatTabGroup;
    @Input() plan: TerraformPlan | null = null;
    @Input() cdkTfJson: any = null; // CDKTF metadata from cdk.tf.json
    @Input() stackType: string = 'terraform'; // Stack type from parent component
    @Input() mode: 'viewonly' | 'normal' = 'viewonly'; // Display mode: viewonly or normal with action buttons
    @Input() defaultFilter: 'auto' | string = 'auto'; // Default filter: 'auto' shows 'changes' if there are changes, otherwise 'total'

    @Output() cdktfStatusChanged = new EventEmitter<boolean>();
    @Output() viewSwitchRequested = new EventEmitter<string>();
    @Output() targetResourceRequested = new EventEmitter<string>();

    resourceSummary: ResourceSummary = { create: 0, update: 0, delete: 0, replace: 0, changes: 0, total: 0 };
    resourcesByType: Map<string, ResourceChange[]> = new Map();
    resourceTypeGroups: Map<string, ResourceTypeGroup> = new Map();
    moduleGroups: ModuleGroup[] = [];
    resourcesByModule: Map<string, Map<string, ResourceChange[]>> = new Map();
    resourcesByModuleWithIterators: Map<string, Map<string, ResourceTypeGroup>> = new Map();
    allVariables: any[] = [];
    filteredVariables = new MatTableDataSource<any>([]);
    allOutputs: any[] = [];
    filteredOutputs = new MatTableDataSource<any>([]);
    outputGroups: Map<string, any[]> = new Map();

    // CDKTF Construct View properties
    showConstructView: boolean = false; // Toggle between Terraform and Construct view
    constructTree: ConstructNode | null = null; // Root construct tree
    pathSegmentGroups: PathSegmentGroup[] = []; // Processed path segments

    // Filter properties
    variableNameFilter: string = '';
    variableValueFilter: string = '';
    outputNameFilter: string = '';
    activeResourceFilter: string | null = null;
    resourceSearchFilter: string = '';

    // Track expanded variables and outputs
    expandedVariables: Set<string> = new Set<string>();
    expandedOutputs: Set<string> = new Set<string>();

    // Track visibility of sensitive values (key format: "resourceAddress.propertyPath")
    sensitiveValuesVisible: Set<string> = new Set<string>();

    // Cache for change calculations to prevent recalculation during change detection
    private changeFieldsCache = new Map<string, { [key: string]: { before: any, after: any, changed: boolean } }>();
    private changeFieldsWithDriftCache = new Map<string, { [key: string]: { before: any, current: any, after: any, changed: boolean, hasDrift: boolean } }>();

    // Selected resource for right panel display
    selectedResource: ResourceChange | null = null;

    displayedColumnsVariables: string[] = ['key', 'type', 'value'];
    displayedColumnsOutputs: string[] = ['key', 'type', 'sensitive', 'value'];
    displayedColumnsResources: string[] = ['address', 'type', 'actions', 'provider'];

    constructor(
        private terraformService: TerraformPlanService,
        private sensitivityService: TerraformSensitivityService,
        private http: HttpClient,
        private cdr: ChangeDetectorRef,
        private clipboard: Clipboard,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['plan'] && changes['plan'].currentValue) {
            this.loadPlanData();
            // Apply default filter when plan changes
            this.applyDefaultFilter();
            // If CDKTF is already loaded, rebuild the construct tree
            if (this.cdkTfJson) {
                this.buildConstructTree();
            }
        }

        if (changes['cdkTfJson'] && changes['cdkTfJson'].currentValue) {
            this.buildConstructTree();
            // Emit CDKTF loaded status and request switch to construct view
            this.cdktfStatusChanged.emit(true);
            this.viewSwitchRequested.emit('construct');
        } else if (changes['cdkTfJson'] && !changes['cdkTfJson'].currentValue) {
            // CDKTF was cleared
            this.cdktfStatusChanged.emit(false);
            this.showConstructView = false;
        }
    }

    private applyDefaultFilter(): void {
        if (this.defaultFilter === 'auto') {
            // Auto mode: show 'changes' if there are changes, otherwise show 'total' (null)
            if (this.resourceSummary.changes > 0) {
                this.activeResourceFilter = 'changes';
            } else {
                this.activeResourceFilter = null; // null means show all (total)
            }
        } else if (this.defaultFilter && this.defaultFilter !== 'total') {
            // Explicit filter specified
            this.activeResourceFilter = this.defaultFilter;
        } else {
            // 'total' or empty means show all
            this.activeResourceFilter = null;
        }
    }

    private loadPlanData(): void {
        if (!this.plan) return;

        // Load the plan into the service
        this.terraformService.loadPlan(this.plan);

        this.resourceSummary = this.terraformService.getResourceSummary();
        this.resourcesByType = this.terraformService.getResourcesByType();
        this.resourceTypeGroups = this.terraformService.getResourceTypeGroups();
        this.moduleGroups = this.terraformService.getModuleGroups();
        this.resourcesByModule = this.terraformService.getResourcesByModule();
        this.resourcesByModuleWithIterators = this.terraformService.getResourcesByModuleWithIterators();
        this.allVariables = this.terraformService.getAllVariables();
        this.filteredVariables.data = this.allVariables;
        this.allOutputs = this.terraformService.getAllOutputs();
        this.filteredOutputs.data = this.allOutputs;
        this.outputGroups = this.terraformService.getOutputGroups();

        // Clear the cache and expanded states when new data is loaded
        this.clearExpandedResources();


    }

    private buildConstructTree(): void {
        if (!this.cdkTfJson || !this.plan) {
            this.constructTree = null;
            this.showConstructView = false;
            return;
        }

        // Get resources with path information
        const resourcesWithPaths = this.extractResourcePaths();

        // Build the construct tree
        this.constructTree = this.createConstructTree(resourcesWithPaths);

        // Automatically switch to construct view when CDKTF is loaded
        this.showConstructView = true;
    }

    private extractResourcePaths(): ResourceChange[] {
        if (!this.plan?.resource_changes || !this.cdkTfJson) {
            console.log('DEBUG: extractResourcePaths - missing plan or cdkTfJson', {
                hasPlan: !!this.plan?.resource_changes,
                hasCdkTfJson: !!this.cdkTfJson
            });
            return [];
        }

        console.log('DEBUG: extractResourcePaths - processing resources', {
            resourceCount: this.plan.resource_changes.length,
            cdkTfKeys: Object.keys(this.cdkTfJson)
        });

        const resourcesWithPaths: ResourceChange[] = [];

        for (const resource of this.plan.resource_changes) {
            // Extract path from CDKTF metadata
            const path = this.getResourcePathFromMetadata(resource.address);
            console.log('DEBUG: resource path extraction', {
                address: resource.address,
                extractedPath: path
            });

            if (path) {
                const pathSegments = path.split('/').filter(segment => segment.length > 0);
                const resourceWithPath = {
                    ...resource,
                    path_segments: pathSegments
                };
                console.log('DEBUG: resource with path', {
                    address: resource.address,
                    pathSegments: pathSegments
                });
                resourcesWithPaths.push(resourceWithPath);
            } else {
                console.log('DEBUG: resource without path', { address: resource.address });
                // No path found, put in root
                resourcesWithPaths.push(resource);
            }
        }

        return resourcesWithPaths;
    }

    private getResourcePathFromMetadata(resourceAddress: string): string | null {
        // The CDKTF JSON structure has resource definitions with //path comments
        // We need to extract the construct path from the resource metadata
        if (!this.cdkTfJson?.resource) {
            return null;
        }

        // CDKTF resource addresses in Terraform plans are like: aws_s3_bucket.example
        // We need to match this to the CDKTF metadata structure
        const parts = resourceAddress.split('.');
        if (parts.length < 2) {
            return null;
        }

        const resourceType = parts[0];
        const resourceName = parts.slice(1).join('.');

        if (this.cdkTfJson.resource[resourceType] && this.cdkTfJson.resource[resourceType][resourceName]) {
            const resourceMetadata = this.cdkTfJson.resource[resourceType][resourceName];

            // Look for construct path in metadata - CDKTF typically includes //path in comments
            if (resourceMetadata && typeof resourceMetadata === 'object') {
                const metadata = resourceMetadata as any;

                // Check for //path comment which contains the full construct path
                if (metadata['//']?.metadata) {
                    return this.extractPathFromComment(metadata['//'].metadata);
                }
            }
        }

        return null;
    }

    private extractPathFromComment(comment: any): string | null {
        // CDKTF includes construct paths in the // comment field
        // The path format is typically like "stack_name/construct1/construct2" 
        // We need to return the full path INCLUDING the stack name

        if (typeof comment === 'object' && comment.path) {
            const fullPath = comment.path;
            console.log('DEBUG: extractPathFromComment - object path', { fullPath });
            return fullPath; // Return the full path
        }

        if (typeof comment === 'string' && comment.includes('/')) {
            // Sometimes the path might be a string directly
            console.log('DEBUG: extractPathFromComment - string path', { comment });
            return comment; // Return the full path
        }

        console.log('DEBUG: extractPathFromComment - no path found', { comment });
        return null;
    }

    private createConstructTree(resourcesWithPaths: ResourceChange[]): ConstructNode | null {
        console.log('DEBUG: createConstructTree - starting', {
            resourceCount: resourcesWithPaths.length,
            resources: resourcesWithPaths.map(r => ({ address: r.address, path_segments: (r as any).path_segments }))
        });

        const pathMap = new Map<string, ConstructNode>();
        const rootChildren: ConstructNode[] = [];

        // Group resources by construct path (excluding resource name)
        const resourcesByConstructPath = new Map<string, ResourceChange[]>();

        for (const resource of resourcesWithPaths) {
            const pathSegments = (resource as any).path_segments;
            if (pathSegments && pathSegments.length > 0) {
                // The last segment is the resource name, not a construct
                // Only create construct nodes for segments before the last one
                const constructSegments = pathSegments.slice(0, -1);

                if (constructSegments.length >= 2) {
                    // Has actual constructs (beyond just stack name): build construct hierarchy
                    // Skip the first segment (stack name) and create constructs for the rest
                    let currentPath = '';
                    for (let i = 1; i < constructSegments.length; i++) {
                        const segmentName = constructSegments[i];
                        currentPath = i === 1 ? segmentName : `${currentPath}/${segmentName}`;

                        if (!pathMap.has(currentPath)) {
                            const node: ConstructNode = {
                                path: currentPath,
                                name: segmentName,
                                depth: i - 1, // Adjust depth since we skip stack name
                                children: [],
                                directResources: [],
                                totalResourceCount: 0,
                                isExpanded: false // Keep constructs collapsed by default
                            };
                            pathMap.set(currentPath, node);
                        }
                    }

                    // Add resource to its construct parent path (excluding stack name)
                    const constructPath = constructSegments.slice(1).join('/');
                    if (!resourcesByConstructPath.has(constructPath)) {
                        resourcesByConstructPath.set(constructPath, []);
                    }
                    resourcesByConstructPath.get(constructPath)!.push(resource);
                } else {
                    // Only stack name or no constructs - this is a root-level resource
                    if (!resourcesByConstructPath.has('')) {
                        resourcesByConstructPath.set('', []);
                    }
                    resourcesByConstructPath.get('')!.push(resource);
                }
            } else {
                // Resource with no path - add to root
                if (!resourcesByConstructPath.has('')) {
                    resourcesByConstructPath.set('', []);
                }
                resourcesByConstructPath.get('')!.push(resource);
            }
        }

        // Assign resources to construct nodes and build hierarchy
        for (const [path, resources] of resourcesByConstructPath) {
            if (path === '') {
                // Handle root resources - they don't have a construct node
                continue;
            }

            const node = pathMap.get(path);
            if (node) {
                node.directResources = resources;
            }
        }

        // Build parent-child relationships
        for (const [path, node] of pathMap) {
            const pathSegments = path.split('/');
            if (pathSegments.length === 1) {
                // Root level construct (directly under stack)
                rootChildren.push(node);
            } else {
                // Find parent construct
                const parentPath = pathSegments.slice(0, -1).join('/');
                const parent = pathMap.get(parentPath);
                if (parent) {
                    parent.children.push(node);
                } else {
                    // Parent doesn't exist, this should be a root level construct
                    rootChildren.push(node);
                }
            }
        }

        // Calculate total resource counts
        this.calculateTotalResourceCounts(rootChildren);

        // If we have multiple root children, create a virtual root
        console.log('DEBUG: createConstructTree - final result', {
            rootChildrenCount: rootChildren.length,
            rootDirectResourcesCount: resourcesByConstructPath.get('')?.length || 0,
            pathMapSize: pathMap.size,
            rootChildren: rootChildren.map(c => ({ name: c.name, path: c.path, directResourceCount: c.directResources.length }))
        });

        const rootDirectResources = resourcesByConstructPath.get('') || [];

        if (rootChildren.length > 1 || (rootChildren.length >= 1 && rootDirectResources.length > 0)) {
            // Multiple root children OR single root child with root direct resources
            // Create virtual root to contain both
            const virtualRoot: ConstructNode = {
                path: '',
                name: 'Constructs',
                depth: -1,
                children: rootChildren,
                directResources: rootDirectResources,
                totalResourceCount: 0,
                isExpanded: true
            };
            this.calculateTotalResourceCounts([virtualRoot]);
            console.log('DEBUG: returning virtual root', {
                totalResources: virtualRoot.totalResourceCount,
                childrenCount: rootChildren.length,
                directResourcesCount: rootDirectResources.length
            });
            return virtualRoot;
        } else if (rootChildren.length === 1) {
            console.log('DEBUG: returning single root', { name: rootChildren[0].name });
            return rootChildren[0];
        } else if (rootDirectResources.length > 0) {
            // Only root direct resources, create a minimal root
            const rootOnlyNode: ConstructNode = {
                path: '',
                name: 'Root Resources',
                depth: -1,
                children: [],
                directResources: rootDirectResources,
                totalResourceCount: 0,
                isExpanded: true
            };
            this.calculateTotalResourceCounts([rootOnlyNode]);
            console.log('DEBUG: returning root-only node', { directResourceCount: rootOnlyNode.directResources.length });
            return rootOnlyNode;
        }

        console.log('DEBUG: returning null - no tree to build');
        return null;
    }

    private calculateTotalResourceCounts(nodes: ConstructNode[]): void {
        for (const node of nodes) {
            node.totalResourceCount = node.directResources.length;

            if (node.children.length > 0) {
                this.calculateTotalResourceCounts(node.children);
                node.totalResourceCount += node.children.reduce((sum, child) => sum + child.totalResourceCount, 0);
            }
        }
    }

    // CDKTF Construct View Methods

    toggleViewMode(): void {
        // Toggle the view mode
        this.showConstructView = !this.showConstructView;

        // Trigger change detection if needed
        this.cdr.detectChanges();
    }

    onConstructToggled(event: { node: ConstructNode; expanded: boolean }): void {
        // Handle construct expansion/collapse
    }

    isCdktfStack(): boolean {
        return this.stackType === 'cdktf';
    }

    hasConstructTree(): boolean {
        const result = this.isCdktfStack() && !!this.constructTree;
        console.log('DEBUG: hasConstructTree', {
            isCdktfStack: this.isCdktfStack(),
            hasConstructTree: !!this.constructTree,
            result: result,
            constructTreeInfo: this.constructTree ? {
                name: this.constructTree.name,
                childrenCount: this.constructTree.children.length,
                directResourceCount: this.constructTree.directResources.length
            } : null
        });
        return result;
    }

    getConstructTreeRootChildren(): ConstructNode[] {
        if (!this.constructTree) return [];

        if (this.constructTree.depth === -1) {
            // Virtual root, return its children
            return this.constructTree.children;
        } else {
            // Single root, return it as an array
            return [this.constructTree];
        }
    }

    getConstructTreeRootDirectResources(): ResourceChange[] {
        if (!this.constructTree) return [];

        if (this.constructTree.depth === -1) {
            // Virtual root, return its direct resources
            return this.constructTree.directResources;
        } else {
            // Single root, it shouldn't have direct resources at the top level
            return [];
        }
    }

    getCdkTfJsonKeys(): string {
        if (!this.cdkTfJson) return 'none';
        return Object.keys(this.cdkTfJson).join(', ');
    }

    applyVariableFilter(): void {
        const nameFilter = this.variableNameFilter.toLowerCase();
        const valueFilter = this.variableValueFilter.toLowerCase();

        this.filteredVariables.data = this.allVariables.filter(variable => {
            const nameMatch = !nameFilter || variable.key.toLowerCase().includes(nameFilter);
            const valueMatch = !valueFilter ||
                (variable.value && variable.value.toString().toLowerCase().includes(valueFilter));

            return nameMatch && valueMatch;
        });
    }

    clearVariableFilters(): void {
        this.variableNameFilter = '';
        this.variableValueFilter = '';
        this.filteredVariables.data = this.allVariables;
    }

    applyOutputFilter(): void {
        const nameFilter = this.outputNameFilter.toLowerCase();

        this.filteredOutputs.data = this.allOutputs.filter(output => {
            const nameMatch = !nameFilter || output.key.toLowerCase().includes(nameFilter);
            return nameMatch;
        });
    }

    clearOutputFilters(): void {
        this.outputNameFilter = '';
        this.filteredOutputs.data = this.allOutputs;
    }

    getActionIcon(actions: string[]): string {
        // Check for replace first (both delete and create, or explicit replace)
        if (actions.includes('replace') || (actions.includes('delete') && actions.includes('create'))) {
            return 'swap_horiz';
        }
        if (actions.includes('create')) return 'add_circle';
        if (actions.includes('update')) return 'edit';
        if (actions.includes('delete')) return 'delete';
        return 'help';
    }

    getActionColor(actions: string[]): string {
        // Check for changes filter
        if (actions.includes('changes')) return '#F8DFB4';
        // Check for replace first (both delete and create, or explicit replace)
        if (actions.includes('replace') || (actions.includes('delete') && actions.includes('create'))) {
            return '#9c27b0';
        }
        if (actions.includes('create')) return '#4caf50';
        if (actions.includes('update')) return '#ff9800';
        if (actions.includes('delete')) return '#f44336';
        return '#757575';
    }

    formatValue(value: any, itemKey?: string, type?: 'variable' | 'output'): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'boolean') {
            return value.toString();
        }
        if (Array.isArray(value)) {
            // For arrays, show summary unless expanded
            if (itemKey) {
                const expandedSet = type === 'output' ? this.expandedOutputs : this.expandedVariables;
                if (expandedSet.has(itemKey)) {
                    return JSON.stringify(value, null, 2);
                }
            }
            return `[${value.length} items]`;
        }
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return value.toString();
    }

    toggleArrayExpansion(variableKey: string, type: 'variable' | 'output' = 'variable'): void {
        const expandedSet = type === 'variable' ? this.expandedVariables : this.expandedOutputs;
        if (expandedSet.has(variableKey)) {
            expandedSet.delete(variableKey);
        } else {
            expandedSet.add(variableKey);
        }
    }

    isArrayExpanded(variableKey: string, type: 'variable' | 'output' = 'variable'): boolean {
        const expandedSet = type === 'variable' ? this.expandedVariables : this.expandedOutputs;
        return expandedSet.has(variableKey);
    }

    isArrayType(value: any): boolean {
        return Array.isArray(value);
    }

    getResourceTypeDisplayName(type: string): string {
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    getVariableTypeIcon(type: string): string {
        switch (type) {
            case 'string': return 'text_fields';
            case 'boolean': return 'toggle_on';
            case 'number': return 'numbers';
            case 'array': return 'view_list';
            case 'object': return 'data_object';
            case 'null': return 'block';
            default: return 'help';
        }
    }

    getVariableTypeColor(type: string): string {
        switch (type) {
            case 'string': return '#2196f3';
            case 'boolean': return '#4caf50';
            case 'number': return '#ff9800';
            case 'array': return '#9c27b0';
            case 'object': return '#607d8b';
            case 'null': return '#757575';
            default: return '#757575';
        }
    }

    onStatButtonClick(action: string): void {
        // If total is clicked, clear the filter
        if (action === 'total') {
            this.activeResourceFilter = null;
        } else {
            // Set the active filter
            this.activeResourceFilter = action;
        }

        // Switch to Resource Changes tab (index 0)
        if (this.tabGroup) {
            this.tabGroup.selectedIndex = 0;
        }
    }

    clearResourceFilter(): void {
        this.activeResourceFilter = null;
    }

    clearResourceSearchFilter(): void {
        this.resourceSearchFilter = '';
    }

    getFilteredResourcesByType(): Map<string, ResourceChange[]> {
        // If no filters are active, return original data
        if (!this.activeResourceFilter && !this.resourceSearchFilter) {
            return this.resourcesByType;
        }

        const filteredMap = new Map<string, ResourceChange[]>();

        for (const [type, resources] of this.resourcesByType.entries()) {
            const filteredResources = resources.filter(resource => {
                // Apply action filter (if active)
                const matchesAction = !this.activeResourceFilter ||
                    this.resourceMatchesAction(resource, this.activeResourceFilter);

                // Apply search filter (if active)
                const matchesSearch = this.resourceMatchesSearch(resource, this.resourceSearchFilter);

                // Resource must match both filters
                return matchesAction && matchesSearch;
            });

            if (filteredResources.length > 0) {
                filteredMap.set(type, filteredResources);
            }
        }

        return filteredMap;
    }

    private resourceMatchesSearch(resource: ResourceChange, searchTerm: string): boolean {
        if (!searchTerm) {
            return true;
        }

        const lowerSearchTerm = searchTerm.toLowerCase();

        // Search in resource address, type, and provider name
        return resource.address.toLowerCase().includes(lowerSearchTerm) ||
            resource.type.toLowerCase().includes(lowerSearchTerm) ||
            resource.provider_name.toLowerCase().includes(lowerSearchTerm);
    }

    private resourceMatchesAction(resource: ResourceChange, action: string): boolean {
        const actions = resource.change.actions;

        // Handle "changes" filter: show all resources that have actions other than no-op
        if (action === 'changes') {
            return !(actions.length === 1 && actions[0] === 'no-op');
        }

        // Check if this resource is actually a replace (has both delete and create, or explicit replace)
        const isReplace = actions.includes('replace') ||
            (actions.includes('delete') && actions.includes('create'));

        // Handle replace case: both delete and create actions should match "replace" filter
        if (action === 'replace') {
            return isReplace;
        }

        // For create and delete actions, exclude resources that are actually being replaced
        if (action === 'create' || action === 'delete') {
            if (isReplace) {
                return false; // Don't show replaced resources in create or delete sections
            }
        }

        // For other actions, check if the specific action is included
        return actions.includes(action);
    }

    getFilteredResourceCount(): number {
        // If no filters are active, return the total count of all resources
        if (!this.activeResourceFilter && !this.resourceSearchFilter) {
            return this.resourceSummary.total;
        }

        // When any filter is active, count only the resources that match all active filters
        return Array.from(this.resourcesByType.values())
            .reduce((total, resources) => {
                const filteredCount = resources.filter(resource => {
                    // Apply action filter (if active)
                    const matchesAction = !this.activeResourceFilter ||
                        this.resourceMatchesAction(resource, this.activeResourceFilter);

                    // Apply search filter (if active)
                    const matchesSearch = this.resourceMatchesSearch(resource, this.resourceSearchFilter);

                    // Resource must match both filters
                    return matchesAction && matchesSearch;
                }).length;
                return total + filteredCount;
            }, 0);
    }

    trackByResourceType(index: number, item: any): string {
        return item.key;
    }

    trackByResource(index: number, item: ResourceChange): string {
        return item.address;
    }

    trackByModuleGroup(index: number, item: ModuleGroup): string {
        return item.name;
    }

    trackByIteratorGroup(index: number, item: IteratorGroup): string {
        return item.base_address;
    }

    getFilteredModuleResourceCount(moduleGroup: ModuleGroup): number {
        const filteredModuleData = this.getFilteredResourcesByModuleWithIterators().get(moduleGroup.name);
        if (!filteredModuleData) {
            return 0;
        }

        let count = 0;
        for (const [, typeGroup] of filteredModuleData) {
            // Use the total_count which already includes both regular and iterator group resources
            count += typeGroup.total_count;
        }

        return count;
    }

    getFilteredIteratorGroupsCount(typeGroupData: any): number {
        if (!typeGroupData.iterator_groups) {
            return 0;
        }

        // Count only iterator groups that have filtered resources
        return typeGroupData.iterator_groups.filter((group: any) => group.resources.length > 0).length;
    }

    trackByResourceTypeGroup(index: number, item: any): string {
        return item.key;
    }

    trackByFieldChange(index: number, item: any): string {
        return item.key;
    }

    trackByFieldKey(index: number, item: any): string {
        return item.key;
    }

    trackByDiffLine(index: number, item: any): string {
        return `${item.type}-${item.lineNumber}-${item.line}`;
    }

    trackBySyncedDiffLine(index: number, item: any): string {
        return `${index}-${item.before.type}-${item.after.type}`;
    }

    trackByPropertyDiff(index: number, item: any): string {
        return `${item.path || item.key}-${item.changed}-${item.depth || 0}`;
    }

    toggleResourceDetails(resource: ResourceChange): void {
        // Add expanded property to the resource if it doesn't exist
        (resource as any).expanded = !(resource as any).expanded;
    }

    selectResource(resource: ResourceChange): void {
        this.selectedResource = resource;
    }

    isResourceSelected(resource: ResourceChange): boolean {
        return this.selectedResource?.address === resource.address;
    }

    /**
     * Check if the selected resource belongs to a bucket (has iterator index)
     */
    selectedResourceBelongsToBucket(): boolean {
        if (!this.selectedResource) return false;
        // Check if address contains [0], [1], etc. or ["key"]
        return /\[\d+\]|\["[^"]+"\]/.test(this.selectedResource.address);
    }

    /**
     * Get the bucket base address for the selected resource
     */
    getSelectedResourceBucketName(): string {
        if (!this.selectedResource) return '';
        // Remove the iterator suffix [0], ["key"], etc.
        return this.selectedResource.address.replace(/\[\d+\]|\["[^"]+"\]$/, '');
    }

    /**
     * Get the count of resources in the selected resource's bucket
     */
    getSelectedResourceBucketCount(): number {
        if (!this.selectedResource) return 0;
        const bucketName = this.getSelectedResourceBucketName();

        // Count all resources that match the bucket pattern
        let count = 0;
        for (const resources of this.resourcesByType.values()) {
            for (const resource of resources) {
                // Check if this resource belongs to the same bucket
                const resourceBucketName = resource.address.replace(/\[\d+\]|\["[^"]+"\]$/, '');
                if (resourceBucketName === bucketName) {
                    count++;
                }
            }
        }
        return count;
    }

    /**
     * Check if selected resource is going to be created
     */
    isSelectedResourceToBeCreated(): boolean {
        if (!this.selectedResource) return false;
        return this.selectedResource.change.actions.includes('create') &&
            !this.selectedResource.change.actions.includes('delete');
    }

    /**
     * Check if selected resource is going to be deleted
     */
    isSelectedResourceToBeDeleted(): boolean {
        if (!this.selectedResource) return false;
        return this.selectedResource.change.actions.includes('delete') &&
            !this.selectedResource.change.actions.includes('create');
    }

    /**
     * Target this specific resource for refresh
     */
    onTargetResource(): void {
        if (!this.selectedResource?.address) {
            this.snackBar.open('No resource selected', 'Close', { duration: 3000 });
            return;
        }
        console.log('Target resource:', this.selectedResource.address);
        this.targetResourceRequested.emit(this.selectedResource.address);
    }

    /**
     * Target the entire bucket/module for refresh
     */
    onTargetBucket(): void {
        const bucketName = this.getSelectedResourceBucketName();
        if (!bucketName) {
            this.snackBar.open('No bucket selected', 'Close', { duration: 3000 });
            return;
        }
        console.log('Target bucket:', bucketName);
        this.targetResourceRequested.emit(bucketName);
    }

    /**
     * Placeholder for importing state
     */
    onImportState(): void {
        console.log('Import state for:', this.selectedResource?.address);
        this.snackBar.open('Import state - Feature coming soon!', 'Close', { duration: 3000 });
    }

    /**
     * Placeholder for removing from state
     */
    onRemoveFromState(): void {
        console.log('Remove from state:', this.selectedResource?.address);
        this.snackBar.open('Remove from state - Feature coming soon!', 'Close', { duration: 3000 });
    }

    clearExpandedResources(): void {
        // Clear all expanded states and cache when switching data
        this.changeFieldsCache.clear();
        this.changeFieldsWithDriftCache.clear();
        this.selectedResource = null;
        this.sensitiveValuesVisible.clear(); // Clear sensitive value visibility state
        for (const [type, resources] of this.resourcesByType.entries()) {
            resources.forEach(resource => {
                (resource as any).expanded = false;
            });
        }
    }

    getResourceConfigData(resource: ResourceChange): any {
        // Return the 'after' data for creates, 'before' for deletes, or both for other actions
        if (resource.change.actions.includes('create')) {
            return resource.change.after;
        } else if (resource.change.actions.includes('delete')) {
            return resource.change.before;
        } else {
            return {
                before: resource.change.before,
                after: resource.change.after
            };
        }
    }

    getChangeDetails(resource: ResourceChange): any {
        // Return detailed change information from resource_changes.change
        return {
            actions: resource.change.actions,
            before: resource.change.before,
            after: resource.change.after,
            after_unknown: resource.change.after_unknown,
            before_sensitive: resource.change.before_sensitive,
            after_sensitive: resource.change.after_sensitive
        };
    }

    getChangedFields(resource: ResourceChange): { [key: string]: { before: any, after: any, changed: boolean } } {
        // Use resource address as cache key
        const cacheKey = resource.address;

        // Return cached result if available
        if (this.changeFieldsCache.has(cacheKey)) {
            return this.changeFieldsCache.get(cacheKey)!;
        }

        const changes: { [key: string]: { before: any, after: any, changed: boolean } } = {};
        const before = resource.change.before || {};
        const after = resource.change.after || {};

        // Get all unique keys from both before and after
        const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

        allKeys.forEach(key => {
            const beforeValue = before[key];
            const afterValue = after[key];
            const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);

            changes[key] = {
                before: beforeValue,
                after: afterValue,
                changed: changed
            };
        });

        // Cache the result
        this.changeFieldsCache.set(cacheKey, changes);
        return changes;
    }

    getSortedChangedFields(resource: ResourceChange): Array<{ key: string, value: { before: any, after: any, changed: boolean } }> {
        const changes = this.getChangedFields(resource);

        // Convert object to array for sorting
        const changeEntries = Object.entries(changes).map(([key, value]) => ({ key, value }));

        // Sort entries: changed properties first, then unchanged properties
        changeEntries.sort((a, b) => {
            if (a.value.changed && !b.value.changed) return -1;
            if (!a.value.changed && b.value.changed) return 1;
            // If both have same change status, sort alphabetically by key
            return a.key.localeCompare(b.key);
        });

        return changeEntries;
    }

    hasChanges(resource: ResourceChange): boolean {
        // Use cached result to avoid recalculation during change detection
        const changes = this.getChangedFields(resource);
        return Object.values(changes).some(change => change.changed);
    }

    formatChangeValue(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'boolean') {
            return value.toString();
        }
        if (Array.isArray(value)) {
            return JSON.stringify(value, null, 2);
        }
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return value.toString();
    }

    isComplexValue(value: any): boolean {
        return Array.isArray(value) || (typeof value === 'object' && value !== null);
    }

    getValueType(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (Array.isArray(value)) {
            return 'array';
        }
        if (typeof value === 'object') {
            return 'object';
        }
        if (typeof value === 'boolean') {
            return 'boolean';
        }
        if (typeof value === 'number') {
            return 'number';
        }
        return 'string';
    }

    /**
     * Compare two values and return line-by-line differences with highlighting
     */
    getLineDifferences(beforeValue: any, afterValue: any): Array<{ line: string, type: 'equal' | 'added' | 'removed' }> {
        const beforeText = this.normalizeValueForComparison(beforeValue);
        const afterText = this.normalizeValueForComparison(afterValue);

        const beforeLines = beforeText.split('\n');
        const afterLines = afterText.split('\n');

        const diff = Diff.diffLines(beforeText, afterText, { ignoreWhitespace: true });
        const result: Array<{ line: string, type: 'equal' | 'added' | 'removed' }> = [];

        diff.forEach(part => {
            if (part.value) {
                const lines = part.value.split('\n');
                // Remove the last empty line if it exists due to splitting
                if (lines[lines.length - 1] === '') {
                    lines.pop();
                }

                lines.forEach(line => {
                    if (part.added) {
                        result.push({ line, type: 'added' });
                    } else if (part.removed) {
                        result.push({ line, type: 'removed' });
                    } else {
                        result.push({ line, type: 'equal' });
                    }
                });
            }
        });

        return result;
    }

    /**
     * Normalize a value for text comparison by converting to formatted string
     */
    private normalizeValueForComparison(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'boolean' || typeof value === 'number') {
            return value.toString();
        }
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
            return JSON.stringify(value, null, 2);
        }
        return value.toString();
    }

    /**
     * Check if two values have meaningful differences when compared as text
     */
    hasTextDifferences(beforeValue: any, afterValue: any): boolean {
        const differences = this.getLineDifferences(beforeValue, afterValue);
        return differences.some(diff => diff.type === 'added' || diff.type === 'removed');
    }

    /**
     * Check if a value is an object (but not an array or null)
     */
    isObjectValue(value: any): boolean {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * Get object property differences for side-by-side comparison with drift support (Before, Current, After)
     */
    getObjectPropertyDifferencesWithDrift(beforeValue: any, currentValue: any, afterValue: any, path: string = ''): Array<{
        key: string,
        before: any,
        current: any,
        after: any,
        changed: boolean,
        hasDrift: boolean,
        isNested: boolean,
        depth: number,
        path: string
    }> {
        const differences: Array<{
            key: string,
            before: any,
            current: any,
            after: any,
            changed: boolean,
            hasDrift: boolean,
            isNested: boolean,
            depth: number,
            path: string
        }> = [];

        // Handle arrays
        if (Array.isArray(beforeValue) || Array.isArray(currentValue) || Array.isArray(afterValue)) {
            const beforeArr = Array.isArray(beforeValue) ? beforeValue : [];
            const currentArr = Array.isArray(currentValue) ? currentValue : [];
            const afterArr = Array.isArray(afterValue) ? afterValue : [];
            const maxLength = Math.max(beforeArr.length, currentArr.length, afterArr.length);

            for (let i = 0; i < maxLength; i++) {
                const beforeItem = beforeArr[i];
                const currentItem = currentArr[i];
                const afterItem = afterArr[i];
                const currentPath = path ? `${path}[${i}]` : `[${i}]`;
                const depth = path ? path.split('.').length : 1;

                // Check changes and drift
                const changed = !this.deepEqual(beforeItem, afterItem);
                const hasDrift = !this.deepEqual(beforeItem, currentItem);

                // Add the array item difference
                differences.push({
                    key: `[${i}]`,
                    before: beforeItem,
                    current: currentItem,
                    after: afterItem,
                    changed: changed,
                    hasDrift: hasDrift,
                    isNested: this.isObjectValue(beforeItem) || this.isObjectValue(currentItem) || this.isObjectValue(afterItem) ||
                        Array.isArray(beforeItem) || Array.isArray(currentItem) || Array.isArray(afterItem),
                    depth: depth,
                    path: currentPath
                });

                // Recursively process nested objects/arrays if they have differences or drift
                if ((changed || hasDrift) && (this.isObjectValue(beforeItem) || this.isObjectValue(currentItem) || this.isObjectValue(afterItem) ||
                    Array.isArray(beforeItem) || Array.isArray(currentItem) || Array.isArray(afterItem))) {
                    const nestedDifferences = this.getObjectPropertyDifferencesWithDrift(beforeItem, currentItem, afterItem, currentPath);
                    differences.push(...nestedDifferences);
                }
            }
        }
        // Handle objects
        else if (this.isObjectValue(beforeValue) || this.isObjectValue(currentValue) || this.isObjectValue(afterValue)) {
            const beforeObj = this.isObjectValue(beforeValue) ? beforeValue : {};
            const currentObj = this.isObjectValue(currentValue) ? currentValue : {};
            const afterObj = this.isObjectValue(afterValue) ? afterValue : {};

            // Get all unique keys from all three objects
            const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(currentObj), ...Object.keys(afterObj)]);

            allKeys.forEach(key => {
                const beforeVal = beforeObj[key];
                const currentVal = currentObj[key];
                const afterVal = afterObj[key];
                const currentPath = path ? `${path}.${key}` : key;
                const depth = path ? path.split('.').length + 1 : 0;

                // Check changes and drift
                const changed = !this.deepEqual(beforeVal, afterVal);
                const hasDrift = !this.deepEqual(beforeVal, currentVal);

                // Add the property difference
                differences.push({
                    key,
                    before: beforeVal,
                    current: currentVal,
                    after: afterVal,
                    changed: changed,
                    hasDrift: hasDrift,
                    isNested: this.isObjectValue(beforeVal) || this.isObjectValue(currentVal) || this.isObjectValue(afterVal) ||
                        Array.isArray(beforeVal) || Array.isArray(currentVal) || Array.isArray(afterVal),
                    depth: depth,
                    path: currentPath
                });

                // Recursively process nested objects/arrays if they have differences or drift
                if ((changed || hasDrift) && (this.isObjectValue(beforeVal) || this.isObjectValue(currentVal) || this.isObjectValue(afterVal) ||
                    Array.isArray(beforeVal) || Array.isArray(currentVal) || Array.isArray(afterVal))) {
                    const nestedDifferences = this.getObjectPropertyDifferencesWithDrift(beforeVal, currentVal, afterVal, currentPath);
                    differences.push(...nestedDifferences);
                }
            });
        }

        return differences;
    }

    /**
     * Get flattened property differences with drift support (only changed or drifted properties)
     */
    getChangedPropertiesFlatWithDrift(beforeValue: any, currentValue: any, afterValue: any): Array<{
        key: string,
        before: any,
        current: any,
        after: any,
        changed: boolean,
        hasDrift: boolean,
        isNested: boolean,
        depth: number,
        path: string
    }> {
        const allDifferences = this.getObjectPropertyDifferencesWithDrift(beforeValue, currentValue, afterValue);

        // Filter to only show properties with changes or drift
        return allDifferences.filter(diff => {
            if (!diff.changed && !diff.hasDrift) return false;

            // If this is a nested object/array, check if it has any changed or drifted children
            if (diff.isNested) {
                const hasChangedOrDriftedChildren = allDifferences.some(childDiff =>
                    (childDiff.changed || childDiff.hasDrift) &&
                    childDiff.path.startsWith(diff.path + '.') &&
                    !childDiff.isNested // Only count leaf nodes as children
                );

                // Only include nested objects/arrays if they don't have changed/drifted leaf children
                // (to avoid duplicate display)
                return !hasChangedOrDriftedChildren;
            }

            return true;
        });
    }

    /**
     * Check if we should show object diff with drift (values are objects/arrays and have property differences or drift)
     */
    shouldShowObjectDiffWithDrift(beforeValue: any, currentValue: any, afterValue: any): boolean {
        // Check if any value is an object or array that can be decomposed
        const beforeIsComplex = this.isObjectValue(beforeValue) || Array.isArray(beforeValue);
        const currentIsComplex = this.isObjectValue(currentValue) || Array.isArray(currentValue);
        const afterIsComplex = this.isObjectValue(afterValue) || Array.isArray(afterValue);

        if (!beforeIsComplex && !currentIsComplex && !afterIsComplex) {
            return false;
        }

        const differences = this.getObjectPropertyDifferencesWithDrift(beforeValue, currentValue, afterValue);
        return differences.length > 0;
    }

    /**
     * Get object property differences for side-by-side comparison with recursive support
     */
    getObjectPropertyDifferences(beforeValue: any, afterValue: any, path: string = ''): Array<{
        key: string,
        before: any,
        after: any,
        changed: boolean,
        isNested: boolean,
        depth: number,
        path: string
    }> {
        const differences: Array<{
            key: string,
            before: any,
            after: any,
            changed: boolean,
            isNested: boolean,
            depth: number,
            path: string
        }> = [];

        // Handle arrays
        if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
            const beforeArr = Array.isArray(beforeValue) ? beforeValue : [];
            const afterArr = Array.isArray(afterValue) ? afterValue : [];
            const maxLength = Math.max(beforeArr.length, afterArr.length);

            for (let i = 0; i < maxLength; i++) {
                const beforeItem = beforeArr[i];
                const afterItem = afterArr[i];
                const currentPath = path ? `${path}[${i}]` : `[${i}]`;
                const depth = path ? path.split('.').length : 1;

                // Check if array items are deeply equal
                const changed = !this.deepEqual(beforeItem, afterItem);

                // Add the array item difference
                differences.push({
                    key: `[${i}]`,
                    before: beforeItem,
                    after: afterItem,
                    changed: changed,
                    isNested: this.isObjectValue(beforeItem) || this.isObjectValue(afterItem) || Array.isArray(beforeItem) || Array.isArray(afterItem),
                    depth: depth,
                    path: currentPath
                });

                // Recursively process nested objects/arrays in array items if they have differences
                if (changed && (this.isObjectValue(beforeItem) || this.isObjectValue(afterItem) || Array.isArray(beforeItem) || Array.isArray(afterItem))) {
                    const nestedDifferences = this.getObjectPropertyDifferences(beforeItem, afterItem, currentPath);
                    differences.push(...nestedDifferences);
                }
            }
        }
        // Handle objects
        else if (this.isObjectValue(beforeValue) || this.isObjectValue(afterValue)) {
            const beforeObj = this.isObjectValue(beforeValue) ? beforeValue : {};
            const afterObj = this.isObjectValue(afterValue) ? afterValue : {};

            // Get all unique keys from both objects
            const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

            allKeys.forEach(key => {
                const beforeVal = beforeObj[key];
                const afterVal = afterObj[key];
                const currentPath = path ? `${path}.${key}` : key;
                const depth = path ? path.split('.').length + 1 : 0;

                // Check if values are deeply equal
                const changed = !this.deepEqual(beforeVal, afterVal);

                // Add the property difference
                differences.push({
                    key,
                    before: beforeVal,
                    after: afterVal,
                    changed: changed,
                    isNested: this.isObjectValue(beforeVal) || this.isObjectValue(afterVal) || Array.isArray(beforeVal) || Array.isArray(afterVal),
                    depth: depth,
                    path: currentPath
                });

                // Recursively process nested objects/arrays if they have differences
                if (changed && (this.isObjectValue(beforeVal) || this.isObjectValue(afterVal) || Array.isArray(beforeVal) || Array.isArray(afterVal))) {
                    const nestedDifferences = this.getObjectPropertyDifferences(beforeVal, afterVal, currentPath);
                    differences.push(...nestedDifferences);
                }
            });
        }

        // Sort by path for hierarchical display
        differences.sort((a, b) => {
            // First sort by depth (parent properties first)
            if (a.depth !== b.depth) {
                return a.depth - b.depth;
            }
            // Then sort by path name for consistent display
            return a.path.localeCompare(b.path);
        });

        return differences;
    }

    /**
     * Deep equality check for objects and arrays
     */
    private deepEqual(obj1: any, obj2: any): boolean {
        if (obj1 === obj2) {
            return true;
        }

        // Handle null/undefined cases
        if (obj1 == null || obj2 == null) {
            return obj1 === obj2;
        }

        // Check if both are objects
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
            return false;
        }

        // Handle arrays
        if (Array.isArray(obj1) !== Array.isArray(obj2)) {
            return false;
        }

        if (Array.isArray(obj1)) {
            if (obj1.length !== obj2.length) {
                return false;
            }
            for (let i = 0; i < obj1.length; i++) {
                if (!this.deepEqual(obj1[i], obj2[i])) {
                    return false;
                }
            }
            return true;
        }

        // Handle objects
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) {
            return false;
        }

        for (const key of keys1) {
            if (!(key in obj2)) {
                return false;
            }
            if (!this.deepEqual(obj1[key], obj2[key])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get flattened property differences (only changed properties, recursively flattened)
     */
    getChangedPropertiesFlat(beforeValue: any, afterValue: any): Array<{
        key: string,
        before: any,
        after: any,
        changed: boolean,
        isNested: boolean,
        depth: number,
        path: string
    }> {
        const allDifferences = this.getObjectPropertyDifferences(beforeValue, afterValue);

        // Filter to only show changed properties, excluding parent objects that contain changed children
        return allDifferences.filter(diff => {
            if (!diff.changed) return false;

            // If this is a nested object/array, check if it has any changed children
            if (diff.isNested) {
                const hasChangedChildren = allDifferences.some(childDiff =>
                    childDiff.changed &&
                    childDiff.path.startsWith(diff.path + '.') &&
                    !childDiff.isNested // Only count leaf nodes as children
                );

                // Only include nested objects/arrays if they don't have changed leaf children
                // (to avoid duplicate display)
                return !hasChangedChildren;
            }

            return true;
        });
    }

    /**
     * Check if we should show object diff (values are objects/arrays and have property differences)
     */
    shouldShowObjectDiff(beforeValue: any, afterValue: any): boolean {
        // Check if either value is an object or array that can be decomposed
        const beforeIsComplex = this.isObjectValue(beforeValue) || Array.isArray(beforeValue);
        const afterIsComplex = this.isObjectValue(afterValue) || Array.isArray(afterValue);

        if (!beforeIsComplex && !afterIsComplex) {
            return false;
        }

        const differences = this.getObjectPropertyDifferences(beforeValue, afterValue);
        return differences.length > 0;
    }

    /**
     * Get the current state (from resource_drift) for a resource if it exists
     */
    getResourceDriftState(resourceAddress: string): any | null {
        return this.terraformService.getResourceDriftState(resourceAddress);
    }

    /**
     * Check if a resource has drift data available
     */
    hasResourceDrift(resourceAddress: string): boolean {
        return this.terraformService.hasResourceDrift(resourceAddress);
    }

    /**
     * Get changed fields with drift support (Before, Current, After)
     */
    getChangedFieldsWithDrift(resource: ResourceChange): { [key: string]: { before: any, current: any, after: any, changed: boolean, hasDrift: boolean } } {
        // Use resource address as cache key
        const cacheKey = `${resource.address}_with_drift`;

        // Return cached result if available
        if (this.changeFieldsWithDriftCache.has(cacheKey)) {
            return this.changeFieldsWithDriftCache.get(cacheKey)!;
        }

        const changes: { [key: string]: { before: any, current: any, after: any, changed: boolean, hasDrift: boolean } } = {};
        const before = resource.change.before || {};
        const after = resource.change.after || {};
        const current = this.getResourceDriftState(resource.address) || before;

        // Get all unique keys from before, current, and after
        const allKeys = new Set([...Object.keys(before), ...Object.keys(current), ...Object.keys(after)]);

        allKeys.forEach(key => {
            const beforeValue = before[key];
            const currentValue = current[key];
            const afterValue = after[key];
            const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
            const hasDrift = JSON.stringify(beforeValue) !== JSON.stringify(currentValue);

            changes[key] = {
                before: beforeValue,
                current: currentValue,
                after: afterValue,
                changed: changed,
                hasDrift: hasDrift
            };
        });

        // Cache the result
        this.changeFieldsWithDriftCache.set(cacheKey, changes);
        return changes;
    }

    /**
     * Get sorted changed fields with drift support
     */
    getSortedChangedFieldsWithDrift(resource: ResourceChange): Array<{ key: string, value: { before: any, current: any, after: any, changed: boolean, hasDrift: boolean } }> {
        const changes = this.getChangedFieldsWithDrift(resource);

        // Convert object to array for sorting
        const changeEntries = Object.entries(changes).map(([key, value]) => ({ key, value }));

        // Sort entries: changed properties first, then drift properties, then unchanged properties
        changeEntries.sort((a, b) => {
            if (a.value.changed && !b.value.changed) return -1;
            if (!a.value.changed && b.value.changed) return 1;
            if (a.value.hasDrift && !b.value.hasDrift) return -1;
            if (!a.value.hasDrift && b.value.hasDrift) return 1;
            // If both have same change/drift status, sort alphabetically by key
            return a.key.localeCompare(b.key);
        });

        return changeEntries;
    }

    /**
     * Get synchronized diff lines for side-by-side display where corresponding lines are paired
     */
    getSynchronizedDiffLines(beforeValue: any, afterValue: any): Array<{
        before: { line: string, type: 'equal' | 'removed' | 'empty', lineNumber: number },
        after: { line: string, type: 'equal' | 'added' | 'empty', lineNumber: number }
    }> {
        const sideBySide = this.getSideBySideDiff(beforeValue, afterValue);
        const result = [];

        // Ensure both arrays have the same length (they should by design)
        const maxLength = Math.max(sideBySide.beforeLines.length, sideBySide.afterLines.length);

        for (let i = 0; i < maxLength; i++) {
            const beforeLine = sideBySide.beforeLines[i] || { line: '', type: 'empty' as const, lineNumber: 0 };
            const afterLine = sideBySide.afterLines[i] || { line: '', type: 'empty' as const, lineNumber: 0 };

            result.push({
                before: beforeLine,
                after: afterLine
            });
        }

        return result;
    }

    /**
     * Get a side-by-side diff view for display in the UI
     */
    getSideBySideDiff(beforeValue: any, afterValue: any): {
        beforeLines: Array<{ line: string, type: 'equal' | 'removed' | 'empty', lineNumber: number }>,
        afterLines: Array<{ line: string, type: 'equal' | 'added' | 'empty', lineNumber: number }>
    } {
        const beforeText = this.normalizeValueForComparison(beforeValue);
        const afterText = this.normalizeValueForComparison(afterValue);

        const diff = Diff.diffLines(beforeText, afterText, { ignoreWhitespace: true });

        const beforeLines: Array<{ line: string, type: 'equal' | 'removed' | 'empty', lineNumber: number }> = [];
        const afterLines: Array<{ line: string, type: 'equal' | 'added' | 'empty', lineNumber: number }> = [];

        let beforeLineNumber = 1;
        let afterLineNumber = 1;

        diff.forEach(part => {
            if (part.value) {
                const lines = part.value.split('\n');
                // Remove the last empty line if it exists due to splitting
                if (lines[lines.length - 1] === '') {
                    lines.pop();
                }

                if (part.added) {
                    // Add empty lines to before side
                    lines.forEach(line => {
                        beforeLines.push({ line: '', type: 'empty', lineNumber: 0 });
                        afterLines.push({ line, type: 'added', lineNumber: afterLineNumber++ });
                    });
                } else if (part.removed) {
                    // Add empty lines to after side
                    lines.forEach(line => {
                        beforeLines.push({ line, type: 'removed', lineNumber: beforeLineNumber++ });
                        afterLines.push({ line: '', type: 'empty', lineNumber: 0 });
                    });
                } else {
                    // Equal lines on both sides
                    lines.forEach(line => {
                        beforeLines.push({ line, type: 'equal', lineNumber: beforeLineNumber++ });
                        afterLines.push({ line, type: 'equal', lineNumber: afterLineNumber++ });
                    });
                }
            }
        });

        return { beforeLines, afterLines };
    }

    /**
     * Get a unified diff view for display in the UI (kept for backward compatibility)
     */
    getUnifiedDiff(beforeValue: any, afterValue: any): Array<{ line: string, type: 'equal' | 'added' | 'removed', lineNumber?: number }> {
        const differences = this.getLineDifferences(beforeValue, afterValue);
        let beforeLineNumber = 1;
        let afterLineNumber = 1;

        return differences.map(diff => {
            const result = { ...diff, lineNumber: 0 };

            if (diff.type === 'equal') {
                result.lineNumber = beforeLineNumber;
                beforeLineNumber++;
                afterLineNumber++;
            } else if (diff.type === 'removed') {
                result.lineNumber = beforeLineNumber;
                beforeLineNumber++;
            } else if (diff.type === 'added') {
                result.lineNumber = afterLineNumber;
                afterLineNumber++;
            }

            return result;
        });
    }

    /**
     * Get filtered module groups based on active resource filter
     */
    getFilteredModuleGroups(): any[] {
        return this.moduleGroups
            .map(moduleGroup => {
                // Calculate filtered resource count by examining all resource types in the module
                const filteredResourcesByModuleWithIterators = this.getFilteredResourcesByModuleWithIterators();
                const moduleResourceTypes = filteredResourcesByModuleWithIterators.get(moduleGroup.name);

                let filteredResourceCount = 0;
                if (moduleResourceTypes) {
                    for (const [type, typeGroup] of moduleResourceTypes.entries()) {
                        filteredResourceCount += typeGroup.total_count;
                    }
                }

                return {
                    ...moduleGroup,
                    resource_count: filteredResourceCount
                };
            })
            .filter(moduleGroup => moduleGroup.resource_count > 0);
    }

    /**
     * Get filtered resources by module with iterator support
     */
    getFilteredResourcesByModuleWithIterators(): Map<string, Map<string, any>> {
        if (!this.activeResourceFilter && !this.resourceSearchFilter) {
            return this.resourcesByModuleWithIterators;
        }

        const filteredMap = new Map<string, Map<string, any>>();

        for (const [moduleAddress, resourceTypes] of this.resourcesByModuleWithIterators.entries()) {
            const filteredResourceTypes = new Map<string, any>();

            for (const [type, typeGroup] of resourceTypes.entries()) {
                // Filter regular resources
                const filteredRegularResources = typeGroup.resources.filter((resource: ResourceChange) => {
                    const matchesAction = !this.activeResourceFilter ||
                        this.resourceMatchesAction(resource, this.activeResourceFilter);
                    const matchesSearch = this.resourceMatchesSearch(resource, this.resourceSearchFilter);
                    return matchesAction && matchesSearch;
                });

                // Filter iterator groups
                const filteredIteratorGroups: IteratorGroup[] = [];
                if (typeGroup.iterator_groups) {
                    for (const iteratorGroup of typeGroup.iterator_groups) {
                        const filteredIteratorResources = iteratorGroup.resources.filter((resource: ResourceChange) => {
                            const matchesAction = !this.activeResourceFilter ||
                                this.resourceMatchesAction(resource, this.activeResourceFilter);
                            const matchesSearch = this.resourceMatchesSearch(resource, this.resourceSearchFilter);
                            return matchesAction && matchesSearch;
                        });

                        if (filteredIteratorResources.length > 0) {
                            filteredIteratorGroups.push({
                                ...iteratorGroup,
                                resources: filteredIteratorResources
                            });
                        }
                    }
                }

                // If there are filtered resources or iterator groups, include this type
                if (filteredRegularResources.length > 0 || filteredIteratorGroups.length > 0) {
                    const totalCount = filteredRegularResources.length +
                        filteredIteratorGroups.reduce((sum: number, group: any) => sum + group.resources.length, 0);

                    filteredResourceTypes.set(type, {
                        ...typeGroup,
                        display_name: this.getResourceTypeDisplayName(type),
                        resources: filteredRegularResources,
                        iterator_groups: filteredIteratorGroups,
                        total_count: totalCount
                    });
                }
            }

            if (filteredResourceTypes.size > 0) {
                filteredMap.set(moduleAddress, filteredResourceTypes);
            }
        }

        return filteredMap;
    }

    private getModuleDisplayName(modulePath: string): string {
        if (modulePath === 'root') {
            return 'Root Module';
        }
        return modulePath;
    }

    private getIteratorBaseAddress(iteratorGroup: IteratorGroup): string {
        return iteratorGroup.base_address;
    }

    private getIteratorType(iteratorGroup: IteratorGroup): string {
        return iteratorGroup.iterator_type;
    }

    /**
     * Check if a property value should be masked (is sensitive and not visible)
     */
    isSensitiveValueMasked(resource: ResourceChange, propertyPath: string, valueType: 'before' | 'after' | 'current'): boolean {
        const sensitivity = this.sensitivityService.isResourcePropertySensitive(resource, propertyPath);
        const isSensitive = valueType === 'after' ? sensitivity.afterSensitive : sensitivity.beforeSensitive;

        if (!isSensitive) {
            return false;
        }

        // Check if this sensitive value is currently visible
        const visibilityKey = `${resource.address}.${propertyPath}.${valueType}`;
        return !this.sensitiveValuesVisible.has(visibilityKey);
    }

    /**
     * Toggle visibility of a sensitive value
     */
    toggleSensitiveValueVisibility(resource: ResourceChange, propertyPath: string, valueType: 'before' | 'after' | 'current'): void {
        const visibilityKey = `${resource.address}.${propertyPath}.${valueType}`;
        if (this.sensitiveValuesVisible.has(visibilityKey)) {
            this.sensitiveValuesVisible.delete(visibilityKey);
        } else {
            this.sensitiveValuesVisible.add(visibilityKey);
        }
    }

    /**
     * Check if a sensitive value is currently visible
     */
    isSensitiveValueVisible(resource: ResourceChange, propertyPath: string, valueType: 'before' | 'after' | 'current'): boolean {
        const visibilityKey = `${resource.address}.${propertyPath}.${valueType}`;
        return this.sensitiveValuesVisible.has(visibilityKey);
    }

    /**
     * Format a value for display, masking it if sensitive
     */
    formatSensitiveValue(value: any, resource: ResourceChange, propertyPath: string, valueType: 'before' | 'after' | 'current'): string {
        const sensitivity = this.sensitivityService.isResourcePropertySensitive(resource, propertyPath);
        const isSensitive = valueType === 'after' ? sensitivity.afterSensitive : sensitivity.beforeSensitive;

        if (isSensitive && this.isSensitiveValueMasked(resource, propertyPath, valueType)) {
            // Get the actual length of the value when formatted
            const actualValue = this.formatChangeValue(value);
            // Return asterisks matching the actual length
            return '*'.repeat(actualValue.length);
        }

        return this.formatChangeValue(value);
    }

    /**
     * Check if a property is sensitive (before or after)
     */
    isPropertySensitive(resource: ResourceChange, propertyPath: string): boolean {
        const sensitivity = this.sensitivityService.isResourcePropertySensitive(resource, propertyPath);
        return sensitivity.beforeSensitive || sensitivity.afterSensitive;
    }

    /**
     * Build the full property path by concatenating change key and property diff path
     * Handles array indices correctly (avoids extra dots before brackets)
     */
    buildFullPropertyPath(changeKey: string, propDiffPath: string): string {
        if (propDiffPath.startsWith('[')) {
            // Array index path - no dot needed
            // Example: changeKey="network_rules", propDiffPath="[0].default_action" -> "network_rules[0].default_action"
            return changeKey + propDiffPath;
        } else {
            // Regular property path - add dot
            // Example: changeKey="tags", propDiffPath="Environment" -> "tags.Environment"
            return changeKey + '.' + propDiffPath;
        }
    }

    /**
     * Copy sensitive value to clipboard
     */
    copySensitiveValueToClipboard(value: any, resource: ResourceChange, propertyPath: string, valueType: 'before' | 'after' | 'current'): void {
        // Get the actual value (unmasked)
        const actualValue = this.formatChangeValue(value);

        // Copy to clipboard
        const success = this.clipboard.copy(actualValue);

        if (success) {
            this.snackBar.open('Sensitive value copied to clipboard', 'Close', {
                duration: 3000,
                horizontalPosition: 'right',
                verticalPosition: 'top'
            });
        } else {
            this.snackBar.open('Failed to copy to clipboard', 'Close', {
                duration: 3000,
                horizontalPosition: 'right',
                verticalPosition: 'top'
            });
        }
    }

    /**
     * Show a short summary for complex values
     * Returns "[ ]" for empty arrays, "x elements" for non-empty arrays,
     * "{ }" for empty objects, "x properties" for non-empty objects,
     * "null" for null values, or "n/a" for other values
     */
    showShortComplexValue(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (Array.isArray(value)) {
            const count = value.length;
            if (count === 0) {
                return '[ ]';
            }
            return `${count} element${count === 1 ? '' : 's'}`;
        }

        if (typeof value === 'object') {
            const count = Object.keys(value).length;
            if (count === 0) {
                return '{ }';
            }
            return `${count} propert${count === 1 ? 'y' : 'ies'}`;
        }

        return 'n/a';
    }

    /**
     * Get flattened replace paths from a resource's change object
     * Converts the 2D array string[][] into a Set<string> for efficient lookups
     */
    private getFlattenedReplacePaths(resource: ResourceChange): Set<string> {
        if (!resource.change.replace_paths || resource.change.replace_paths.length === 0) {
            return new Set<string>();
        }

        const flattenedPaths = new Set<string>();
        for (const pathArray of resource.change.replace_paths) {
            if (Array.isArray(pathArray)) {
                // Join the array elements to form a property path
                // e.g., ["principal_id"] becomes "principal_id"
                // e.g., ["network_rules", "0", "default_action"] becomes "network_rules.0.default_action" or "network_rules[0].default_action"
                const path = pathArray.join('.');
                flattenedPaths.add(path);
            }
        }

        return flattenedPaths;
    }

    /**
     * Check if a property requires resource replacement
     * Compares the property path against the flattened replace_paths
     */
    isPropertyForceReplacement(resource: ResourceChange, propertyPath: string): boolean {
        const replacePaths = this.getFlattenedReplacePaths(resource);

        if (replacePaths.size === 0) {
            return false;
        }

        // Check if the property path exactly matches a replace path
        if (replacePaths.has(propertyPath)) {
            return true;
        }

        // Also check with array index notation variations
        // e.g., "network_rules[0].default_action" vs "network_rules.0.default_action"
        const normalizedPath = propertyPath.replace(/\[(\d+)\]/g, '.$1');
        if (replacePaths.has(normalizedPath)) {
            return true;
        }

        // Check if any replace path matches when considering array indices
        for (const replacePath of replacePaths) {
            const normalizedReplacePath = replacePath.replace(/\[(\d+)\]/g, '.$1');
            if (normalizedReplacePath === normalizedPath) {
                return true;
            }
        }

        return false;
    }
}