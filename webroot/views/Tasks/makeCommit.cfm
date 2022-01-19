
<cfoutput>

<p>Today: #dateFormat(Now(), 'yyyy-mm-dd')#</p>
<p>Commit: <b>#commitValue#</b></p>
<p>Total days: #totalDays#</p>


<cfif commitValue>

    <!--- update text file --->
    <cffile action="write"
        file="#Expandpath('/miscellaneous/commit.txt')#"
        output="Commit for: #dateFormat(Now(), 'yyyy-mm-dd')#"/>

</cfif>

</cfoutput>
