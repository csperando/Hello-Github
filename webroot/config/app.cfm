<cfscript>
// Use this file to set variables for the Application.cfc's "this" scope.

// Log user data
this.name = "dataApp";
this.applicationTimeout = CreateTimeSpan(0,0,30,0);
this.sessionTimeout = CreateTimeSpan(0,0,5,0);
this.sessionManagement = "true";

</cfscript>
