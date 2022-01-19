<cfscript>
// Use this file to set variables for the Application.cfc's "this" scope.

    this.name = "gitApp";
    this.applicationTimeout = CreateTimeSpan(0,0,30,0);
    this.sessionTimeout = CreateTimeSpan(0,0,5,0);
    this.sessionManagement = "true";

    this.startDate = '2022-01-01';

</cfscript>
