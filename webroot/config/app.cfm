<cfscript>
// Use this file to set variables for the Application.cfc's "this" scope.

this.name = "gitApp";
this.applicationTimeout = CreateTimeSpan(0,0,30,0);
this.sessionTimeout = CreateTimeSpan(0,0,5,0);
this.sessionManagement = "true";

urlString = "http://127.0.0.1:#cgi.server_port#/index.cfm/tasks/makeCommit";

cfschedule(
    action="update",
    task="helloGithub",
    operation = "HTTPRequest",
    startDate = "1/1/2022",
    startTime = "9:00 AM",
    url = urlString,
    port = "#cgi.server_port#",
    interval = "daily");

</cfscript>
