<cfscript>

    if(CGI.path_info.find('tasks') NEQ -1) {

        // restrict access to /tasks to the server only
        if(CGI.remote_addr NEQ '127.0.0.1') {
            abort;
        }

        // restrict access to ports as well?

    }


</cfscript>
