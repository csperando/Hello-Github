<cfscript>

    Session.hello = {};

    Session.hello.startDate = '2022-01-01';
    Session.hello.today = dateFormat(Now(), 'yyyy-mm-dd');
    Session.hello.commit = false;

</cfscript>
