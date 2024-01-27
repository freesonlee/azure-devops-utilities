export function generateQuery(search: string): string {
  const filter = search
    ? ` AND ([System.Id] = ${search} OR [System.Title] CONTAINS WORDS '${search.replaceAll(
        "'",
        "''"
      )}')`
    : '';

  return `SELECT [System.Id] FROM WorkItems 
        WHERE (
            ([System.AuthorizedAs] = @me AND [System.AuthorizedDate] >= @today - 30) 
            OR ([System.CreatedBy] = @me AND [System.CreatedDate] >= @today - 30) 
            OR ([System.AssignedTo] = @me AND [System.AuthorizedDate] >= @today - 30) ) 
        AND NOT ([System.WorkItemType] = 'Bug' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Code Review Request' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Code Review Response' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Epic' AND [System.State] IN ('Closed','Removed')) 
        AND NOT ([System.WorkItemType] = 'Feature' AND [System.State] IN ('Closed','Removed')) 
        AND NOT ([System.WorkItemType] = 'Feedback Request' AND [System.State] IN ('Closed','Removed')) 
        AND NOT ([System.WorkItemType] = 'Feedback Response' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Shared Steps' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Task' AND [System.State] IN ('Closed','Removed')) 
        AND NOT ([System.WorkItemType] = 'Test Case' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Test Plan' AND [System.State] IN ('Inactive')) 
        AND NOT ([System.WorkItemType] = 'Test Suite' AND [System.State] IN ('Completed')) 
        AND NOT ([System.WorkItemType] = 'User Story' AND [System.State] IN ('Closed','Removed')) 
        AND NOT ([System.WorkItemType] = 'Issue' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Shared Parameter' AND [System.State] IN ('Inactive')) 
        AND NOT ([System.WorkItemType] = 'Production Issue' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Tech Task' AND [System.State] IN ('Closed','Rejected')) 
        AND NOT ([System.WorkItemType] = 'Root Cause Analysis' AND [System.State] IN ('Closed')) 
        AND NOT ([System.WorkItemType] = 'Service Request' AND [System.State] IN ('Closed')) 
        ${filter}
        ORDER BY [System.AuthorizedDate] DESC`
    .replaceAll('\n', '')
    .replaceAll('\r', '');
}
