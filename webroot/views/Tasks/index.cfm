
<h1>Scheduled Tasks:</h1>

<p><a href="https://docs.lucee.org/reference/tags/schedule.html" target="_blank" rel="noreferrer">Read more here</a></p>

<cfschedule
	action="list"
	returnvariable="taskList"/>

<cfdump var="#taskList#"/>
