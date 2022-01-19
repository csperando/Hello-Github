
component extends="controller" {

	function config() {
		// usesLayout(name="layout", template="layout");
	}

	function postTweet() {

		bearer_token = "AAAAAAAAAAAAAAAAAAAAAPEQXgEAAAAAQQqd4hd4OJ4KIlGD%2FT9lNIk8F10%3DV9a7rmzimYT1VrvqPMskZnxHAZKlp4UTleO1zaM4ikpkitp4r6";

		cfhttp(
			method="GET",
			url="https://api.twitter.com/2/tweets/search/recent?query=from:twitterdev",
			result="httpResult"
		) {
			cfhttpparam(
				type="header",
				name="Authorization",
				value="Bearer #bearer_token#"
			);
		}

		tweetData = httpResult.filecontent;

		try {
			// convert response (json string) to struct
			jsonTweet = deserializeJSON(tweetData);

			// .data is an array of each tweet
			for(var i=1; i<=len(jsonTweet.data); i++){
				jsonTweet.data[i].text = decodeForHtml(jsonTweet.data[i].text);
			}

		} catch(any e) {
			jsonTweet = e;
		}


	}
}
