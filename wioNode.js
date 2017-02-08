module.exports = {

	request: require('request'),

	WIONODEBASE: 'https://us.wio.seeed.io/v1/node/',
	LEDAPI: 'GenericDOutD1/high_pulse/',

	SOUNDAPI: 'GroveSpeakerD0/sound_ms/',
	TOKENPARAM: 'access_token=',

	freq: 440, // [Hz]
	ledDuration: 4000, // [ms]
	soundDuration: 500, // [ms]
	accessToken: '89500243588d3dbdd226dcf9876b44db',

	// Enumeration for Grove Sensors
	LED: 0,
	SPEAKER: 1,

	postWioAPI: function(sensorType) {

		var apiPath = '';

		switch(sensorType){
			case this.LED:
				apiPath = this.LEDAPI + this.ledDuration.toString();
				break;
			case this.SPEAKER:
				apiPath = this.SOUNDAPI + this.freq.toString() + '/' + this.soundDuration.toString();
				break;
		}

		var uri = this.WIONODEBASE + apiPath + '?' + this.TOKENPARAM + this.accessToken;

    	// API送信用データ
	    var options = {
    		uri: uri,
    	    json: true
	    };

    	console.log(uri);
		// API叩く
	    this.request.post(options, function(error, response, body){
    		if (!error && response.statusCode == 200) {
        		console.log("POST response body=>");
    	        console.log(body);
	        } else {
            	console.error('error: '+ response.statusCode);
        	    console.error(response.body);
    	    }
	    }); // request.post

	} 

};