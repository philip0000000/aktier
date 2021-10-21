$(function () {
	"use strict";
	
	// for better performance - to avoid searching in DOM
	let body = $("body");
	
	let NumberOfCmds = 0;
	let NumberOfLineCharts = 0;
	let NumberOfTables = 0;
	let NumberOfSearchForDisruptionWindows = 0;
	let NumberOfTableTimerWindows = 0;
	let NumberOfFromStartToNowGainWindows = 0;
	
	let SearchForDisruptionDelayValue = 1000;
	let SearchForDisruptionRun = true;
	let SearchForDisruptionTickers;
	let SearchForDisruptionPercentageProgressValues = [];
	
	let TableTimerDelayValue = 100;
	let TableTimerRun = true;
	let TableTimerTickers = [];
	let TempTableTimerTickers = [];
	let TableTimerTickersLength = 0;
	
	let ConnectionStatus = 0; // 0:not connected 1:connected 2:error 3:closed
							  // 4:does not support websocket 5:something is wrong

	// if user is running mozilla then use it's built-in WebSocket
	window.WebSocket = window.WebSocket || window.MozWebSocket;

	// if browser doesn't support WebSocket, just show some notification and exit
	if (!window.WebSocket) {
		ConnectionStatus = 4;
		updateWebSocketConnectionStatus();
		return;
	}

	// open connection
	let connection = new WebSocket('ws://127.0.0.1:1337');
	
	// If the server is not able to respond after 3 seconds then show a error message, to notify the user that something is wrong.
	setInterval(function() {
		if (connection.readyState !== 1) {
			ConnectionStatus = 5;
			updateWebSocketConnectionStatus();
		}
	}, 3000);

	connection.onopen = function () {
		ConnectionStatus = 1;
		updateWebSocketConnectionStatus();
	};

	connection.onerror = function (error) { // if error do this
		ConnectionStatus = 2;
		updateWebSocketConnectionStatus();
	};
	
	connection.onclose = function (event) {
		ConnectionStatus = 3;
		updateWebSocketConnectionStatus();
	};

	// handling incoming messages
	connection.onmessage = function (message) {
		// try to parse JSON message. Because we know that the server always returns
		// JSON this should work without any problem but we should make sure that
		// the massage is not chunked or otherwise damaged.
		let json;
		try {
			json = JSON.parse(message.data);
		} catch (e) {
			console.log('This doesn\'t look like a valid JSON: ', message.data);
			return;
		}
		
		// 2. make a tab/colume of all yahoo stocks, 2.5 filter, so you only get reall stocks!(that can be bought on avanza!)
		switch (json.type) {
			case 'send chat history to newest cmd window': // entire message history
				{
					let latestCmdElement = document.getElementById("CmdContent" + (NumberOfCmds - 1).toString());
					if (latestCmdElement !== null) {
						for (let i=0; i < json.data.length; i++) { // insert every single message to the latest cmd window
							let message = json.data[i].text,
								dt = new Date(json.data[i].time);
							
							let div = document.createElement("div");
							div.textContent = (dt.getHours() < 10 ? '0' + dt.getHours() : dt.getHours()) + ":"
											  + (dt.getMinutes() < 10 ? '0' + dt.getMinutes() : dt.getMinutes()) + " "
											  + message;
							latestCmdElement.prepend(div);
						}
					}
					enableAllCmdInputs();
				}
				break;
			case 'message': // it is a text message
				addMessage(json.data.text, json.data.time);
				enableAllCmdInputs(); // let the user write another message
				break;
			case 'command':
				switch (json.action) {
					case 'alert':
						alert("a alert command was sent!");
						break;
					case 'create cmd':
						addCmdToPage();
						break;
					case 'create line chart':
						addLineChart()
						break;
					case 'get trading hours':
						addMessage(json.data);
						break;
					case 'search for disruptions':
						if (json.data != -1) {
							SearchForDisruptionTickers = json.data;
							SearchForDisruptionPercentageProgressValues.push(Math.round(SearchForDisruptionTickers.length * 0.2));
							SearchForDisruptionPercentageProgressValues.push(Math.round(SearchForDisruptionTickers.length * 0.4));
							SearchForDisruptionPercentageProgressValues.push(Math.round(SearchForDisruptionTickers.length * 0.6));
							SearchForDisruptionPercentageProgressValues.push(Math.round(SearchForDisruptionTickers.length * 0.8));
							addSearchForDisruption();
						}
						else
							addMessage("search for disruptions, ERROR!");
						break;
					case 'search for disruptions set time':
						SearchForDisruptionDelayValue = json.data;
						break;
					case 'search for disruptions toggle status':
						SearchForDisruptionRun = !SearchForDisruptionRun;
						break;
					case 'text add':
						addMessageToSearchForDisruptionWindow(json.data);
						break;
					case 'get stock':
						let num = addLineChart(); // function should return ID name, for next function input! --v
						//console.log(json.data);
						DrawLineChart({ CanvasElmntName: "LineChartCanvas" + num, CanvasOverlayElmntName: "LineChartCanvasOverlay" + num,
										LineChartColor: "green",
										ReferenceTextRightSide: 5,//[ "Bad!!!", "Ok...", "Good :-D!" ],
										ReferenceTextLeftSide: 8,
										ReferenceTextBottomTimeData: json.data.timestamp,
										dataArr: [ json.data.indicators.quote[0].close ] });
						//addMessage(json.data);
						break;
					case 'get table':
						if (json.data == -1)
							addMessage("get table, ERROR!");
						else
							addTable(json.data, true);
						break;
					case 'add table timer':
						addTableTimer();
						break;
					case 'from start to now gain':
						if (json.data != -1) {
							addFromStartToNowGain();
						}
						else
							addMessage("from start to now gain, ERROR!");
						break;
					case 'from start to now gain set speed':
						document.getElementById('FromStartToNowGainSpeedDisplay').innerHTML = "Speed:" + json.data;
						break;
					case 'from start to now gain set min to look back':
						document.getElementById('FromStartToNowGainCurrentMinToLookBack').innerHTML = "Min to look back at:" + json.data;
						break;
					case 'from start to now gain set option':
						document.getElementById('FromStartToNowGainCurrentOption').innerHTML = "Current option:" + json.data;
						break;
					case 'from start to now gain set percentage progress':
						document.getElementById('FromStartToNowGainPercentageProgress').innerHTML = "Progress:" + json.data + "%";
						break;
					case 'from start to now gain set table':
						addFromStartToNowGainTable(json.data);
						break;
					case 'from start to now gain status':
						switch (json.data) {
							default:
							case 0:
								document.getElementById('FromStartToNowGainStatus').innerHTML = "Current status:";
								break;
							case 1:
								document.getElementById('FromStartToNowGainStatus').innerHTML = "Current status:Get all tickers market open value";
								break;
							case 2:
								document.getElementById('FromStartToNowGainStatus').innerHTML = "Current status:Mixed result from option 1, 2 or 3";
								break;
						}
					case "get table gain usa to table timer":
						if (json.data != -1)
							AddTableGainToTableTimer(json.data[0], json.data[2]);
						else
							addMessage("get table gain usa to table timer, ERROR!");
						break;
					case "get table loser usa to table timer":
						if (json.data != -1)
							AddTableGainToTableTimer(json.data[0], json.data[2]);
						else
							addMessage("get table loser usa to table timer, ERROR!");
						break;
					case "get table most active usa to table timer":
						if (json.data != -1)
							AddTableGainToTableTimer(json.data[0], json.data[2]);
						else
							addMessage("get table most active usa to table timer, ERROR!");
						break;
					case "get table most volatile usa to table timer timer":
						if (json.data != -1)
							AddTableGainToTableTimer(json.data[0], json.data[2]);
						else
							addMessage("get table most volatile usa to table timer, ERROR!");
						break;
					case "get table most overbought usa to table timer":
						if (json.data != -1)
							AddTableGainToTableTimer(json.data[0], json.data[2]);
						else
							addMessage("get table most overbought usa to table timer, ERROR!");
						break;
					case "get table most oversold usa to table timer":
						if (json.data != -1)
							AddTableGainToTableTimer(json.data[0], json.data[2]);
						else
							addMessage("get table most oversold usa to table timer, ERROR!");
						break;
					case "get VIX to table timer":
						TableTimerAddTicker("^VIX");
						TableTimerAddTicker("^GSPC");
						TableTimerAddTicker("BTC-USD");
						break;
					case "tradeview info":
						if (json.data[1] == -1)
							addMessage("ticker: " + json.data[0] + ", ERROR!");
						else
							addMessage("ticker: " + json.data[0] + ", Summary:" + json.data[1][1] + " Oscillators:" + json.data[1][0] + " Moving Averages:" + json.data[1][2]);
						break;
					default:
						break;
				}
				break;
			case 'search for disruptions message':
				//console.log(json.data);
				if (typeof json.data.timestamp !== 'undefined') {
					let oldestTimeIndex = json.data.timestamp.length-1;
					if (oldestTimeIndex > 1) {
						let oldestTime = json.data.timestamp[oldestTimeIndex];
						let searchForThisTime = oldestTime - 300; // 300 = 5 * 60 (5 min, before)
						do {
							--oldestTimeIndex;
							} while (oldestTimeIndex > -1 && json.data.timestamp[oldestTimeIndex] > searchForThisTime);
						if (oldestTimeIndex > -1 && json.data.timestamp[oldestTimeIndex] <= searchForThisTime &&
							json.data.indicators.quote[0].open[json.data.timestamp.length-1] != null &&
							json.data.indicators.quote[0].open[oldestTimeIndex] != null) {
							let DifferenceInValue, OldValue = json.data.indicators.quote[0].open[oldestTimeIndex],
												   NewValue = json.data.indicators.quote[0].open[json.data.timestamp.length-1];
							
							
							if (NewValue > OldValue) {
								DifferenceInValue = ((NewValue - OldValue) / OldValue)*100;
								if (DifferenceInValue > 1.4) {
									addMessageToSearchForDisruptionWindow("OldValue: " + OldValue);
									addMessageToSearchForDisruptionWindow("NewValue: " + NewValue);
									addMessageToSearchForDisruptionWindow(json.data.meta.symbol + " +" + DifferenceInValue);
									addMessageToSearchForDisruptionWindow("---");
									console.log(OldValue.toString());
									console.log(NewValue.toString());
									console.log(json.data.indicators.quote[0].open);
									console.log(json.data.meta.symbol + " +" + DifferenceInValue);
									console.log("---");
								}
							}
							else {
								DifferenceInValue = ((OldValue - NewValue) / OldValue)*100;
								if (DifferenceInValue > 3) {
									addMessageToSearchForDisruptionWindow(OldValue.toString());
									addMessageToSearchForDisruptionWindow(NewValue.toString());
									addMessageToSearchForDisruptionWindow(json.data.meta.symbol + " -" + DifferenceInValue);
									addMessageToSearchForDisruptionWindow("---");
									console.log(OldValue.toString());
									console.log(NewValue.toString());
									console.log(json.data.indicators.quote[0].open);
									console.log(json.data.meta.symbol + " -" + DifferenceInValue);
									console.log("---");
								}
							}
						}
						//else
							// error
					}
				}
				break;
			case 'table timer ticker current value':
				{
					let DidNotFoundTheTicker = true, m = 0, mm = TableTimerTickers.length;
					while (m < mm && DidNotFoundTheTicker)
						if (TableTimerTickers[m][0] == json.data[0])
							DidNotFoundTheTicker = false;
						else
							m++;
					if (!DidNotFoundTheTicker) {
						document.getElementById('TableTimerCurrentValue' + json.data[0]).innerHTML = json.data[1];
						
						if (json.data[1] > TableTimerTickers[m][2]) { // above
							if (json.data[1] < TableTimerTickers[m][3]) {
								if (TableTimerTickers[m][1] != 1) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#9acd32'; // green (yellowgreen)
									TableTimerTickers[m][1] = 1;
								}
							}
							else if (json.data[1] < TableTimerTickers[m][4]) {
								if (TableTimerTickers[m][1] != 2) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#7ba428';
									TableTimerTickers[m][1] = 2;
								}
							}
							else if (json.data[1] < TableTimerTickers[m][5]) {
								if (TableTimerTickers[m][1] != 3) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#28a428';
									TableTimerTickers[m][1] = 3;
								}
							}
							else if (json.data[1] < TableTimerTickers[m][6]) {
								if (TableTimerTickers[m][1] != 4) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#4169e1'; // blue
									TableTimerTickers[m][1] = 4;
								}
							}
							else {
								if (TableTimerTickers[m][1] != 5) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#4f4fe3';
									TableTimerTickers[m][1] = 5;
								}
							}
						}
						else if (json.data[1] < TableTimerTickers[m][7]) { // below
							if (json.data[1] > TableTimerTickers[m][8]) {
								if (TableTimerTickers[m][1] != 6) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#f08080'; // red (lightcoral)
									TableTimerTickers[m][1] = 6;
								}
							}
							else if (json.data[1] > TableTimerTickers[m][9]) {
								if (TableTimerTickers[m][1] != 7) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#e73232';
									TableTimerTickers[m][1] = 7;
								}
							}
							else if (json.data[1] > TableTimerTickers[m][10]) {
								if (TableTimerTickers[m][1] != 8) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#cd1818';
									TableTimerTickers[m][1] = 8;
								}
							}
							else {
								if (TableTimerTickers[m][1] != 9) {
									document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = '#c95fec'; // purple
									TableTimerTickers[m][1] = 9;
								}
							}
						}
						else if (TableTimerTickers[m][1] != 0) { // neutral
							document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = 'white';
							TableTimerTickers[m][1] = 0;
						}
						
						document.getElementById('TableTimerTradingviewInfo' + json.data[0]).innerHTML = json.data[2];
					}
				}
				break;
			case 'new table timer ticker':
				{
					let DidNotFoundTheTicker = true, m = 0, mm = TempTableTimerTickers.length;
					while (m < mm && DidNotFoundTheTicker)
						if (TempTableTimerTickers[m] == json.data[0])
							DidNotFoundTheTicker = false;
						else
							m++;
					if (!DidNotFoundTheTicker) {
						document.getElementById('TableTimerAtStartCell' + json.data[0]).innerHTML = json.data[1];
						TableTimerTickers.push([ json.data[0],
												 0, // 0:white // neutral
												 json.data[1] + ((json.data[1] / 100) * 0.01), // 1:(light green) // UpperAlert
												 json.data[1] + ((json.data[1] / 100) * 0.3), // 2:
												 json.data[1] + ((json.data[1] / 100) * 0.5), // 3:
												 json.data[1] + ((json.data[1] / 100) * 1.0), // 4:
												 json.data[1] + ((json.data[1] / 100) * 1.5), // 5:
												 json.data[1] - ((json.data[1] / 100) * 0.01), // 6:(light red)   // LowerAlert
												 json.data[1] - ((json.data[1] / 100) * 0.3), // 7:
												 json.data[1] - ((json.data[1] / 100) * 0.5), // 8:
												 json.data[1] - ((json.data[1] / 100) * 1.0), // 9:
												 json.data[2] ]); // tradingview value, 0: neutral, 1:strong sell, 2: sell, 3:buy, 4:strong buy
						document.getElementById('TableTimerTradingviewInfo' + json.data[0]).innerHTML = json.data[2];
						TempTableTimerTickers.splice(m, 1);
						TableTimerTickersLength++;
					}
				}
				break;
			case 'reset table timer ticker':
				{
					let DidNotFoundTheTicker = true, m = 0, mm = TableTimerTickers.length;
					while (m < mm && DidNotFoundTheTicker)
						if (TableTimerTickers[m][0] == json.data[0])
							DidNotFoundTheTicker = false;
						else
							m++;
					if (!DidNotFoundTheTicker) {
						TableTimerTickers[m][1] = 0;
						TableTimerTickers[m][2] = json.data[1] + ((json.data[1] / 100) * 0.01);
						TableTimerTickers[m][3] = json.data[1] + ((json.data[1] / 100) * 0.3);
						TableTimerTickers[m][4] = json.data[1] + ((json.data[1] / 100) * 0.5);
						TableTimerTickers[m][5] = json.data[1] + ((json.data[1] / 100) * 1.0);
						TableTimerTickers[m][6] = json.data[1] + ((json.data[1] / 100) * 1.5);
						TableTimerTickers[m][7] = json.data[1] - ((json.data[1] / 100) * 0.01);
						TableTimerTickers[m][8] = json.data[1] - ((json.data[1] / 100) * 0.3);
						TableTimerTickers[m][9] = json.data[1] - ((json.data[1] / 100) * 0.5);
						TableTimerTickers[m][10] = json.data[1] - ((json.data[1] / 100) * 1.0);
						document.getElementById('TableTimerAtStartCell' + json.data[0]).innerHTML = json.data[1];
						document.getElementById('TableTimerCurrentValue' + json.data[0]).innerHTML = '';
						document.getElementById('TableTimerCurrentValue' + json.data[0]).style.background = 'white';
					}
				}
				break;
			default:
				console.log('Hmm..., I\'ve never seen JSON like this: ', json);
				break;
		}
	};
	
	function KeyLisener(evt) {
		if (evt.keyCode == 112)
			addCmdToPage();
	}
	document.addEventListener('keyup', KeyLisener, false); // register keyboard lisener

	// ================================================================================================
	// Add message to all cmds
	function addMessage(message, dt) {
		for (let n = 0; n < NumberOfCmds; n++) {
			let CmdElement = document.getElementById("CmdContent" + n.toString());
			if (CmdElement !== null) {
				let div = document.createElement("div");
				
				// Add date if dt parameter has value
				if (arguments.length == 2) {
					let date = new Date(dt);
					div.textContent = (date.getHours() < 10 ? '0' + date.getHours() : date.getHours()) + ":"
									   + (date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()) + " ";
				}
				
				div.textContent += message;
				CmdElement.prepend(div);
			}
		}
	}
	
	function enableAllCmdInputs() {
		for (let n = 0; n < NumberOfCmds; n++) {
			let CmdElement = document.getElementById("CmdInput" + n.toString());
			if (CmdElement !== null) {
				CmdElement.removeAttribute('disabled');
			}
		}
	}
	function disabledAllCmdInputs() {
		for (let n = 0; n < NumberOfCmds; n++) {
			let CmdElement = document.getElementById("CmdInput" + n.toString());
			if (CmdElement !== null) {
				CmdElement.setAttribute('disabled', 'disabled');
			}
		}
	}
	
	function updateWebSocketConnectionStatus() { // sends a message to every cmd window
		switch (ConnectionStatus) {
			case 0: // not connected
				disabledAllCmdInputs();
				break;
			case 1: // connected
				enableAllCmdInputs();
				break;
			case 2: // error
				addMessage("A websocket error has occurred!");
				break;
			case 3: // closed
				addMessage("The connection has been closed successfully.");
				disabledAllCmdInputs();
				break;
			case 4: // does not support websocket
				addMessage("Sorry, but your browser doesn\'t support WebSockets.");
				disabledAllCmdInputs();
				break;
			case 5: // something is wrong
				addMessage("Sorry, but your browser doesn\'t support WebSockets.");
				disabledAllCmdInputs();
				for (let n = 0; n < NumberOfCmds; n++) {
					let CmdElement = document.getElementById("CmdInput" + n.toString());
					if (CmdElement !== null) {
						CmdElement.value = "Unable to comminucate with the WebSocket server. Maybe Javascript is disabled!!!";
					}
				}
				break;
			default:
				break;
		}
	}
	
	// Add cmd to page
	function addCmdToPage() {
		body.prepend( // Add div to page
					'<div id="CmdWindow' + NumberOfCmds.toString() + '" class="Window">' +
						'<div id="CmdWindowTitleBar' + NumberOfCmds.toString() + '" class="WindowTitleBar">' +
							'<button onclick="ToggleCmd(\'CmdIO' + NumberOfCmds.toString() + '\')">_</button>' +
							'<button onclick="DeleteElement(\'CmdWindow' + NumberOfCmds.toString() + '\')">X</button>' +
						'</div>' +
						'<div id="CmdIO' + NumberOfCmds.toString() + '" class="CmdWindowIO">' +
							'<div id="CmdContent' + NumberOfCmds.toString() + '" class="CmdWindowDisplayContent"></div>' +
							'<input type="text" id="CmdInput' + NumberOfCmds.toString() + '" disabled="disabled" class="CmdWindowTextInput"/>' +
						'</div>' +
					'</div>');
		
		dragElement(document.getElementById("CmdWindow" + NumberOfCmds.toString())); // Make the DIV element draggable
		document.getElementById("CmdInput" + NumberOfCmds.toString()).onkeypress = onkeypressCmdWindow;
		NumberOfCmds++; //prepare for next time the function will be called
		
		//updateWebSocketConnectionStatus();
		connection.send("Command:send chat history to newest cmd window"); // tell the server to send chat history to the new cmd window
		
		function dragElement(elmnt) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			if (document.getElementById('CmdWindowTitleBar' + NumberOfCmds.toString())) {
				// if present, the header is where you move the DIV from:
				document.getElementById('CmdWindowTitleBar' + NumberOfCmds.toString()).onmousedown = dragMouseDown;
			}

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				// get the mouse cursor position at startup:
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				// call a function whenever the cursor moves:
				document.onmousemove = elementDrag;
			}

			function closeDragElement() {
				// stop moving when mouse button is released:
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				// calculate the new cursor position:
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				// set the element's new position:
				elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
				elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
			}
		}
		
		function onkeypressCmdWindow(e) {
			// Send mesages, when user presses Enter key
			if (e.keyCode === 13) {
				let TargetElement = document.getElementById(e.target.attributes[1].value);
				
				if (TargetElement.value) {
					// send the message as an ordinary text
					connection.send("Message:" + TargetElement.value);
					TargetElement.value = '';
					
					// disable the input field to make the user wait until server sends back response
					disabledAllCmdInputs();
				}
			}
		}
	}
	
	// Add a line chart
	function addLineChart() {
		body.prepend( // Add div to page
					'<div id="LineChartWindow' + NumberOfLineCharts.toString() + '" class="Window">' +
						'<div id="LineChartWindowTitleBar' + NumberOfLineCharts.toString() + '" class="WindowTitleBar">' +
							'<button onclick="ToggleCmd(\'LineChartWindowDrawing' + NumberOfLineCharts.toString() + '\')">_</button>' +
							'<button onclick="DeleteElement(\'LineChartWindow' + NumberOfLineCharts.toString() + '\')">X</button>' +
						'</div>' +
						'<div id="LineChartWindowDrawing' + NumberOfLineCharts.toString() + '" class="LineChartWindowDrawing">' +
							'<canvas id="LineChartCanvas' + NumberOfLineCharts.toString() + '" height="450" width="550"></canvas>' +
							'<canvas id="LineChartCanvasOverlay' + NumberOfLineCharts.toString() + '" height="450" width="550"></canvas>' +
						'</div>' +
						'<div id="LineChartResizer' + NumberOfLineCharts.toString() + '" class="resizer"> </div>' +
					'</div>');
		
		dragElement(document.getElementById("LineChartWindow" + NumberOfLineCharts.toString())); // Make the DIV element draggable
		resizeElement();
		++NumberOfLineCharts;
		return NumberOfLineCharts-1;
		
		// draw line chart
		
		function dragElement(elmnt) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			if (document.getElementById('LineChartWindowTitleBar' + NumberOfLineCharts.toString())) {
				// if present, the header is where you move the DIV from:
				document.getElementById('LineChartWindowTitleBar' + NumberOfLineCharts.toString()).onmousedown = dragMouseDown;
			}

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				// get the mouse cursor position at startup
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				// call a function whenever the cursor moves
				document.onmousemove = elementDrag;
			}

			function closeDragElement() {
				// stop moving when mouse button is released
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				// calculate the new cursor position
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				// set the element's new position
				elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
				elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
			}
		}
		function resizeElement() {
			let elmnt = document.getElementById('LineChartWindowDrawing' + NumberOfLineCharts.toString());
			let elmntParent = document.getElementById('LineChartWindow' + NumberOfLineCharts.toString());
			let elmntTitleBarWindow = document.getElementById('LineChartWindowTitleBar' + NumberOfLineCharts.toString());
			document.getElementById('LineChartResizer' + NumberOfLineCharts.toString()).onmousedown = initDrag;
			
			function initDrag(e) {
				document.onmouseup = stopDrag;
				document.onmousemove = doDrag;
			}

			function stopDrag(e) {
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function doDrag(e) {
				elmnt.style.width = (e.clientX - elmntParent.offsetLeft) + "px";
				elmntTitleBarWindow.style.width = elmnt.style.width;
				elmnt.style.height = (e.clientY - (elmnt.offsetTop + elmntParent.offsetTop)) + "px";
			}
		}
	}
	function DrawLineChart({ CanvasElmntName, CanvasOverlayElmntName, backgroundColor,
							 YAxisOnTheLeft, XAxisOnTheBottom, AxisColor, // if it is a number we draw that many reference numbers on that axis, if wstring just evenly distrubute the strings on the reference
							 ReferenceTextSize,
							 ReferenceTextRightSide, ReferenceTextLeftSide, // double array, with 2nd array being text string for reference value(???)
							 ReferenceTextBottomTimeData, // we only care about the 1st, last and middle time! everything else is ignored on the referens bottom x-axis, but will be displayed if hover over with mouse on line chart
							 ReferenceTextBottomTimeSpan,
							 LineChartColor, dataArr, // double array, 2nd being value, 1st being how many arrays
							 }) {
		
		let canvas = document.getElementById(CanvasElmntName);
		let context = canvas.getContext("2d");

		let CANVAS_WIDTH = canvas.width;
		let CANVAS_HEIGHT = canvas.height;
		let SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT = 2;

		// erases the entire canvas
		//context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		// draw background color
		if (backgroundColor) {
			context.fillStyle = backgroundColor;
			context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		}
		
		// calculate upper and lower bounderys of the line chart value for the Y-axis
		/*================================================================================================
		||                         -v-   -v-   |-[If we enter this zone, we add more space(add HalfDifferentialValueBetweenHeighAndMiddle of space)!]
		||                          |     |-HalfDifferentialValueBetweenHeighAndMiddle
		||                          |    -^-
		||          HighestValue    |-DifferentialValueBetweenHeighAndMiddle
		||                          |
		||                          |
		||                         -^-
		||---100%---middleValue---------------------------------------------------------------------------
		||
		||
		||
		||          LowestValue (if we only hace 1 value, this will be -0,01% of that value)
		||
		||
		||
		\\==============================================================================================*/
		let HighestValue = 0;
		let LowestValue = 9999999999;
		let LineCharHighestValue = 0;
		let LineCharLowestValue = 0;
		let DifferentialValueBetweenHeighAndMiddle = 0;
		let HalfDifferentialValueBetweenHeighAndMiddle = 0;
		let MiddleValue = 0;
		for (let i = 0, ii = dataArr.length; i < ii; i++) // round the values of the line charts to two decimals
			for (let u = 0, uu = dataArr[i].length; u < uu; u++) {
				dataArr[i][u] = Math.round((dataArr[i][u] + Number.EPSILON) * 100) / 100;
				if (dataArr[i][u] > HighestValue)
					HighestValue = dataArr[i][u];
				if (dataArr[i][u] < LowestValue && dataArr[i][u] != 0)
					LowestValue = dataArr[i][u];
			}
		DifferentialValueBetweenHeighAndMiddle = (HighestValue - LowestValue)/2;
		MiddleValue = DifferentialValueBetweenHeighAndMiddle + LowestValue;
		HalfDifferentialValueBetweenHeighAndMiddle = DifferentialValueBetweenHeighAndMiddle/2;
		
		let HighestValueYAxis = HighestValue + HalfDifferentialValueBetweenHeighAndMiddle;
		let LowestValueYAxis = LowestValue - HalfDifferentialValueBetweenHeighAndMiddle;
		
		// calculate the padding for the reference text, by finding the longest text(max 10 characters)
		// 1st get the size of the padding font
		let ReferenceSize;
		if (ReferenceTextSize)
			ReferenceSize = ReferenceTextSize;
		else
			ReferenceSize = 16; // 16px is the default size for reference values/text
		context.font = ReferenceSize + "px sans-serif";
		let YAxisOnTheRightPadding = 0;
		let YAxisOnTheLeftPadding = 0;
		let XAxisOnTheBottomPadding = 0;
		// calculate reference value padding on y-axis on the right side
		if (typeof ReferenceTextRightSide == "number") {
			let AmountOfNumbersToSplits = ReferenceTextRightSide;
			if (AmountOfNumbersToSplits <= 1)
				ReferenceTextRightSide = [ Math.round(((((HighestValueYAxis - LowestValueYAxis)/2) + LowestValueYAxis) + Number.EPSILON) * 100) / 100 ]; // rounds the value also
			else if (AmountOfNumbersToSplits == 2)
				ReferenceTextRightSide = [ Math.round((HighestValueYAxis + Number.EPSILON) * 100) / 100, Math.round((LowestValueYAxis + Number.EPSILON) * 100) / 100 ];
			else {
				let PaddingBetweenSizes = (HighestValueYAxis - LowestValueYAxis)/(AmountOfNumbersToSplits-1);
				let TempValue = PaddingBetweenSizes + LowestValueYAxis;
				ReferenceTextRightSide = [ LowestValueYAxis ];
				for (let HighestValueLoweredToThreashold = HighestValueYAxis - (PaddingBetweenSizes / 2);
					TempValue < HighestValueLoweredToThreashold; TempValue += PaddingBetweenSizes)
					ReferenceTextRightSide.push(TempValue);
				ReferenceTextRightSide.push(HighestValueYAxis);
				
				// round the values of the array to two decimals
				for (let i = 0, ii = ReferenceTextRightSide.length; i < ii; i++)
					ReferenceTextRightSide[i] = Math.round((ReferenceTextRightSide[i] + Number.EPSILON) * 100) / 100;
			}
		}
		if (typeof ReferenceTextRightSide == "object") {
			let widest = 0;
			for (let i = 0, ii = ReferenceTextRightSide.length; i < ii; i++) // choose to take the width as padding of the string with most characters
				if (ReferenceTextRightSide[i].toString().length > ReferenceTextRightSide[widest].toString().length)
					widest = i;
			let textdata = context.measureText(ReferenceTextRightSide[widest]);
			YAxisOnTheRightPadding = textdata.width + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT;
		}
		// calculate reference value padding on y-axis on the left side
		if (typeof ReferenceTextLeftSide == "number") {
			let AmountOfNumbersToSplits = ReferenceTextLeftSide;
			if (AmountOfNumbersToSplits <= 1)
				ReferenceTextLeftSide = [ Math.round(((((HighestValueYAxis - LowestValueYAxis)/2) + LowestValueYAxis) + Number.EPSILON) * 100) / 100 ]; // rounds the value also
			else if (AmountOfNumbersToSplits == 2)
				ReferenceTextLeftSide = [ Math.round((HighestValueYAxis + Number.EPSILON) * 100) / 100, Math.round((LowestValueYAxis + Number.EPSILON) * 100) / 100 ];
			else {
				let PaddingBetweenSizes = (HighestValueYAxis - LowestValueYAxis)/(AmountOfNumbersToSplits-1);
				let TempValue = PaddingBetweenSizes + LowestValueYAxis;
				ReferenceTextLeftSide = [ LowestValueYAxis ];
				for (let HighestValueLoweredToThreashold = HighestValueYAxis - (PaddingBetweenSizes / 2);
					TempValue < HighestValueLoweredToThreashold; TempValue += PaddingBetweenSizes)
					ReferenceTextLeftSide.push(TempValue);
				ReferenceTextLeftSide.push(HighestValueYAxis);
				
				// round the values of the array to two decimals
				for (let i = 0, ii = ReferenceTextLeftSide.length; i < ii; i++)
					ReferenceTextLeftSide[i] = Math.round((ReferenceTextLeftSide[i] + Number.EPSILON) * 100) / 100;
			}
		}
		if (typeof ReferenceTextLeftSide == "object") {
			let widest = 0;
			for (let i = 0, ii = ReferenceTextLeftSide.length; i < ii; i++) // choose to take the width as padding of the string with most characters
				if (ReferenceTextLeftSide[i].toString().length > ReferenceTextLeftSide[widest].toString().length)
					widest = i;
			let textdata = context.measureText(ReferenceTextLeftSide[widest]);
			YAxisOnTheLeftPadding = textdata.width + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT;
		}
		// calculate reference value padding on x-axis at the bottom
		if (typeof ReferenceTextBottomTimeData == "object") {
			function ConvertToNewYorkTime(TimeData) {
				const len = Math.ceil(Math.log10(1626336240 + 1));
				if (len == 10) // we need to add three 0 to the end, as Yahoo and other websites omit this information
					TimeData *= 1000;
				let TimeZoneAmericaNY = new Date(TimeData).toLocaleString("en-US", {timeZone: "America/New_York"}); // for list of time zones, see this: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
				let returnValue = TimeZoneAmericaNY.slice(11, 15) + TimeZoneAmericaNY.slice(-3);
				return returnValue;
			}
			switch (ReferenceTextBottomTimeData.length) {
				case 0: //this is a error, we dont want this!
					ReferenceTextBottomTimeData = -1; // this is to make so this number is seen as a "error"
					break;
				case 1:
					ReferenceTextBottomTimeData = [ ConvertToNewYorkTime(ReferenceTextBottomTimeData[0]) ];
					break;
				case 2:
					ReferenceTextBottomTimeData = [ ConvertToNewYorkTime(ReferenceTextBottomTimeData[0]), ConvertToNewYorkTime(ReferenceTextBottomTimeData[1]) ];
					break;
				case 3:
					ReferenceTextBottomTimeData = [ ConvertToNewYorkTime(ReferenceTextBottomTimeData[0]), ConvertToNewYorkTime(ReferenceTextBottomTimeData[1]), ConvertToNewYorkTime(ReferenceTextBottomTimeData[2]) ];
					break;
				default: // get the 1st, get the middle and rounds it to a number that is the next largest integer with Math.ceil(), and get last number
					ReferenceTextBottomTimeData = [ ConvertToNewYorkTime(ReferenceTextBottomTimeData[0]), ConvertToNewYorkTime(ReferenceTextBottomTimeData[Math.ceil(ReferenceTextBottomTimeData.length/2)]), ConvertToNewYorkTime(ReferenceTextBottomTimeData[ReferenceTextBottomTimeData.length-1]) ];
					break;
			}
			
			// calculate the bottom padding height
			if (ReferenceTextBottomTimeData != -1) {
				let textdata = context.measureText(ReferenceTextBottomTimeData[0]);
				XAxisOnTheBottomPadding = Math.round(textdata.actualBoundingBoxAscent + textdata.actualBoundingBoxDescent) + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT;
			}
		}
		
		// DRAW THE LINE CHARTS
		// make your graph look less jagged
		context.lineJoin = "round";
		// choose color for line chart
		if (LineChartColor)
			context.strokeStyle = LineChartColor;
		else
			context.strokeStyle = "black"; // default line chart color
		
		// Draw line chart
		let BeginingOfDrawAreaXAxis = YAxisOnTheLeftPadding;
		let EndOfDrawAreaXAxis = CANVAS_WIDTH - YAxisOnTheRightPadding;
		let XAxisMoveToNextPoint = (EndOfDrawAreaXAxis - BeginingOfDrawAreaXAxis) / dataArr[0].length;
		
		let EndOfDrawAreaYAxis = CANVAS_HEIGHT - XAxisOnTheBottomPadding;
		let DiffBetweenHeighAndLow = HighestValueYAxis - LowestValueYAxis;
		
		if (dataArr[0][0] == 0) //<-----------------we can not have the 1st value be 0, this is a shity fix. Make better later!!!!!!!!!!!!!!!!!!!!
			dataArr[0][0] = 1;
		context.moveTo(BeginingOfDrawAreaXAxis, ((HighestValueYAxis - dataArr[0][0]) / DiffBetweenHeighAndLow) * EndOfDrawAreaYAxis);
		for (let i = 0, ii = dataArr[0].length; i < ii; i++) {
			BeginingOfDrawAreaXAxis += XAxisMoveToNextPoint;
			if (dataArr[0][i] != 0)
				context.lineTo(BeginingOfDrawAreaXAxis, ((HighestValueYAxis - dataArr[0][i]) / DiffBetweenHeighAndLow) * EndOfDrawAreaYAxis);
		}
		context.stroke();
		
		// axis color
		if (AxisColor)
			context.strokeStyle = AxisColor;
		else
			context.strokeStyle = "#BBB"; // default axis color
		// draw Y and X axis
		if (typeof ReferenceTextRightSide == "object") {
			context.beginPath();
			context.moveTo(CANVAS_WIDTH - YAxisOnTheRightPadding, 0);
			context.lineTo(CANVAS_WIDTH - YAxisOnTheRightPadding, CANVAS_HEIGHT);
			context.stroke();
		}
		if (typeof ReferenceTextLeftSide == "object") {
			context.beginPath();
			context.moveTo(0 + YAxisOnTheLeftPadding, 0);
			context.lineTo(0 + YAxisOnTheLeftPadding, CANVAS_HEIGHT);
			context.stroke();
		}
		if (typeof ReferenceTextBottomTimeData == "object") {
			context.beginPath();
			context.moveTo(0,            CANVAS_HEIGHT - XAxisOnTheBottomPadding);
			context.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - XAxisOnTheBottomPadding);
			context.stroke();
		}
		// set reference text/value font and size
		context.font = ReferenceSize + "px sans-serif";
		// draw reference text/value
		
		if (typeof ReferenceTextRightSide == "object") {
			if (ReferenceTextRightSide.length <= 1) {
				context.fillText(ReferenceTextRightSide[0], CANVAS_WIDTH - YAxisOnTheRightPadding + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT, EndOfDrawAreaYAxis/2);
			}
			else {
				// draw 1st text, lowest text
				context.fillText(ReferenceTextRightSide[0], CANVAS_WIDTH - YAxisOnTheRightPadding + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT, EndOfDrawAreaYAxis - SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT);
				
				let SpacingToPlaceText = 1/(ReferenceTextRightSide.length-1); // will get in % of EndOfDrawAreaYAxis
				for (let YPosition = 1 - SpacingToPlaceText, Lowest = SpacingToPlaceText/2, n = 1;
					YPosition > Lowest; YPosition -= SpacingToPlaceText, n++) {
					context.fillText(ReferenceTextRightSide[n], CANVAS_WIDTH - YAxisOnTheRightPadding + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT, YPosition * EndOfDrawAreaYAxis);
				}
				
				// calculate height of text font
				let textdata = context.measureText(ReferenceTextRightSide[0]);
				let HeightOfText = textdata.actualBoundingBoxAscent + textdata.actualBoundingBoxDescent;
				context.fillText(ReferenceTextRightSide[ReferenceTextRightSide.length-1], CANVAS_WIDTH - YAxisOnTheRightPadding + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT, HeightOfText);
			}
		}
		if (typeof ReferenceTextLeftSide == "object") {
			if (ReferenceTextLeftSide.length <= 1) {
				context.fillText(ReferenceTextLeftSide[0], 0, EndOfDrawAreaYAxis/2);
			}
			else {
				// draw 1st text, lowest text
				context.fillText(ReferenceTextLeftSide[0], 0, EndOfDrawAreaYAxis);
				
				let SpacingToPlaceText = 1/(ReferenceTextLeftSide.length-1); // will get in % of EndOfDrawAreaYAxis
				for (let YPosition = 1 - SpacingToPlaceText, Lowest = SpacingToPlaceText/2, n = 1;
					YPosition > Lowest; YPosition -= SpacingToPlaceText, n++) {
					context.fillText(ReferenceTextLeftSide[n], 0, YPosition * EndOfDrawAreaYAxis);
				}
				
				// calculate height of text font
				let textdata = context.measureText(ReferenceTextLeftSide[0]);
				let HeightOfText = textdata.actualBoundingBoxAscent + textdata.actualBoundingBoxDescent;
				context.fillText(ReferenceTextLeftSide[ReferenceTextLeftSide.length-1], 0, HeightOfText);
			}
		}
		if (typeof ReferenceTextBottomTimeData == "object") { // we only draw max 3 time dates, no more
			let ReferenceTextMarginSize = ((CANVAS_WIDTH-YAxisOnTheRightPadding)-YAxisOnTheLeftPadding) / ReferenceTextBottomTimeData.length;
			let XPosition = YAxisOnTheLeftPadding + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT;
			let YPosition = CANVAS_HEIGHT;
			
			// draw the 1st text in the ReferenceTextBottomTimeData
			context.fillText(ReferenceTextBottomTimeData[0], XPosition, YPosition);
			
			if (ReferenceTextBottomTimeData.length > 1) {
				if (ReferenceTextBottomTimeData.length == 3) { // draw the middle time date
					context.fillText(ReferenceTextBottomTimeData[1], YAxisOnTheLeftPadding + (((CANVAS_WIDTH-YAxisOnTheRightPadding)-YAxisOnTheLeftPadding)/2), YPosition);
				}
				
				// draw the last string in ReferenceTextBottomTimeData
				// 1st calculate width of text
				let textdata = context.measureText(ReferenceTextBottomTimeData[ReferenceTextBottomTimeData.length-1]);
				let TextWidth = textdata.width + SPACE_BETWEEN_REFERENCE_LINES_AND_TEXT;
				
				context.fillText(ReferenceTextBottomTimeData[ReferenceTextBottomTimeData.length-1], (CANVAS_WIDTH-YAxisOnTheRightPadding) - TextWidth, YPosition);
			}
		}
		
		// setup the overlay, if it is not empty
		if (CanvasOverlayElmntName) {
			let canvas2 = document.getElementById(CanvasOverlayElmntName);
			let context2 = canvas2.getContext("2d");
			let InformationBoxX = 100;
			let InformationBoxY = 100;
			let WindowIsNotBeingMoved = true;
			let rect = canvas2.getBoundingClientRect();
			
			let MouseDown = false;
			let ReferencceXAxisPointWhenDragging = -1;
			let ReferencceValue1;
			let ReferencceValue2;
			let DifferenceInValue;
			let ResultStringComparingValue1And2;
			
			let posY; // help variable for drawing horizontal line
			
			BeginingOfDrawAreaXAxis = YAxisOnTheLeftPadding;
			context2.font = "16px sans-serif";
			
			// add mouse event listener for the LineChartWindowTitleBar
			let num = CanvasOverlayElmntName.slice(22); // remove "LineChartCanvasOverlay"
			let elemTitleBar = document.getElementById('LineChartWindowTitleBar' + num);
			
			elemTitleBar.addEventListener('mousedown', function(e) {
				rect = canvas2.getBoundingClientRect();
				
				elemTitleBar.addEventListener('mousemove', handleMouseMove);
				elemTitleBar.addEventListener('mouseup', handleMouseUp);
				WindowIsNotBeingMoved = false;
			});
			function handleMouseMove(e) {
				rect = canvas2.getBoundingClientRect(); // is this needed?
				//console.log(rect);
			}
			function handleMouseUp(e) {
				rect = canvas2.getBoundingClientRect();
				//console.log("!!!DONE!!!");
				//console.log(rect);
				WindowIsNotBeingMoved = true;
				elemTitleBar.removeEventListener('mousemove', handleMouseMove);
				elemTitleBar.removeEventListener('mousedown', handleMouseMove);
			}
			
			function draw(e) {
				if (WindowIsNotBeingMoved) {
					InformationBoxX = e.clientX - rect.left;
					InformationBoxY = e.clientY - rect.top;
					
					// clear canvas
					context2.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
					
					// only draw, if we are inside the area where the graph is being displayed
					if (InformationBoxX > BeginingOfDrawAreaXAxis && InformationBoxX < EndOfDrawAreaXAxis && InformationBoxY < EndOfDrawAreaYAxis) {
						// draw blue line if mouse button is down
						if (MouseDown) {
							if (ReferencceXAxisPointWhenDragging == -1) {
								ReferencceXAxisPointWhenDragging = InformationBoxX;
								ReferencceValue1 = ~~((InformationBoxX - BeginingOfDrawAreaXAxis)/XAxisMoveToNextPoint);
							}
								
							context2.beginPath();
							context2.strokeStyle  = "blue";
							context2.moveTo(ReferencceXAxisPointWhenDragging, 0);
							context2.lineTo(ReferencceXAxisPointWhenDragging, EndOfDrawAreaYAxis);
							context2.stroke();
						}
						
						// draw lines
						context2.beginPath();
						context2.strokeStyle  = "orange"; //grey
						posY = ((HighestValueYAxis - dataArr[0][~~((InformationBoxX - BeginingOfDrawAreaXAxis)/XAxisMoveToNextPoint)]) / DiffBetweenHeighAndLow) * EndOfDrawAreaYAxis;
						context2.moveTo(BeginingOfDrawAreaXAxis, posY);
						context2.lineTo(EndOfDrawAreaXAxis, posY);
						//context2.moveTo(BeginingOfDrawAreaXAxis, InformationBoxY);
						//context2.lineTo(EndOfDrawAreaXAxis, InformationBoxY);
						context2.stroke();
						context2.beginPath();
						if (MouseDown)
							context2.strokeStyle  = "red";
						context2.moveTo(InformationBoxX, 0);
						context2.lineTo(InformationBoxX, EndOfDrawAreaYAxis);
						context2.stroke();
						
						// draw rect
						//context2.fillStyle = "green";
						//context2.fillRect(InformationBoxX, InformationBoxY, 100, -15);

						// draw value
						if (MouseDown) {
							// calculate value and draw theme
							ReferencceValue2 = ~~((InformationBoxX - BeginingOfDrawAreaXAxis)/XAxisMoveToNextPoint)
							if (ReferencceValue1 != ReferencceValue2) {
								DifferenceInValue = dataArr[0][ReferencceValue1] > dataArr[0][ReferencceValue2] ? dataArr[0][ReferencceValue1] - dataArr[0][ReferencceValue2] :
																												  dataArr[0][ReferencceValue2] - dataArr[0][ReferencceValue1];
								if ((ReferencceValue2 > ReferencceValue1 && dataArr[0][ReferencceValue2] > dataArr[0][ReferencceValue1]) ||
									(ReferencceValue1 > ReferencceValue2 && dataArr[0][ReferencceValue2] < dataArr[0][ReferencceValue1])) {
										ResultStringComparingValue1And2 = "+" + (Math.round(((DifferenceInValue + Number.EPSILON)*100) * 100) / 100) + " (";
										if (ReferencceValue2 > ReferencceValue1 && dataArr[0][ReferencceValue2] > dataArr[0][ReferencceValue1])
											ResultStringComparingValue1And2 += (Math.round((((DifferenceInValue/dataArr[0][ReferencceValue1])*100) + Number.EPSILON) * 100) / 100) + " %)";
										else
											ResultStringComparingValue1And2 += (Math.round((((DifferenceInValue/dataArr[0][ReferencceValue2])*100) + Number.EPSILON) * 100) / 100) + " %)";
									}
								else {
									ResultStringComparingValue1And2 = "-" + (Math.round((DifferenceInValue + Number.EPSILON) * 100) / 100) + " (";
									if (ReferencceValue2 > ReferencceValue1)
										ResultStringComparingValue1And2 += (Math.round((((DifferenceInValue/dataArr[0][ReferencceValue1])*100) + Number.EPSILON) * 100) / 100) + " %)";
									else
										ResultStringComparingValue1And2 += (Math.round((((DifferenceInValue/dataArr[0][ReferencceValue2])*100) + Number.EPSILON) * 100) / 100) + " %)";
								}
							}
							else
								ResultStringComparingValue1And2 = "0,00 (0,00%)";
							
							context2.fillStyle = "black";
							context2.fillText(ResultStringComparingValue1And2, InformationBoxX + 15, InformationBoxY);
						}
						else {
							context2.fillStyle = "black";
							context2.fillText(dataArr[0][(~~((InformationBoxX - BeginingOfDrawAreaXAxis)/XAxisMoveToNextPoint))].toString(), InformationBoxX + 15, InformationBoxY); // use bitwise operators(~~) to truncate the decimal
						}
					}
				}
			}
			
			// add mouse event listeners for the canvas2
			canvas2.addEventListener('mousedown', function(e) {
				MouseDown = true;
				draw(e);
			});
			canvas2.addEventListener('mouseup', function(e) {
				MouseDown = false;
				ReferencceXAxisPointWhenDragging = -1;
				draw(e);
			});
			
			canvas2.addEventListener('mousemove', function(e) {
				draw(e);
			});
		}
	}
	
	function addTable( data, // double array, every array inside the array, has 1st string representing what it is displayed -followed by values
					   addNumbers // if true, add number to the array values
					   ) {
		body.prepend( // Add div to page
					'<div id="TableWindow' + NumberOfTables.toString() + '" class="Window">' +
						'<div id="TableWindowTitleBar' + NumberOfTables.toString() + '" class="WindowTitleBar">' +
							'<button onclick="ToggleCmd(\'TableWindowDrawing' + NumberOfTables.toString() + '\')">_</button>' +
							'<button onclick="DeleteElement(\'TableWindow' + NumberOfTables.toString() + '\')">X</button>' +
						'</div>' +
						'<div id="TableWindowDrawing' + NumberOfTables.toString() + '" class="TableWindowDrawing">' +
						'</div>' +
						'<div id="TableResizer' + NumberOfTables.toString() + '" class="resizer"> </div>' +
					'</div>');
		
		dragElement(document.getElementById("TableWindow" + NumberOfTables.toString())); // Make the DIV element draggable
		resizeElement();
		if (addNumbers) {
			let arr = [ ' ' ]; // add 1st empty space, as the first row is for titles
			
			let LongestLength = -1;
			for (let r = 0, rr = data.length; r < rr; r++)
				if (data[r].length > LongestLength)
					LongestLength = data[r].length;
			
			--LongestLength; // we remove one number, cause it is ' ', empty space in arr
			
			for (let i = 0, ii = 1; i < LongestLength; i++, ii++)
				arr.push(ii);
			
			data.unshift(arr);
		}
		addTableData(data);
		++NumberOfTables;
		return NumberOfTables-1;
		
		function dragElement(elmnt) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			if (document.getElementById('TableWindowTitleBar' + NumberOfTables.toString())) {
				// if present, the header is where you move the DIV from:
				document.getElementById('TableWindowTitleBar' + NumberOfTables.toString()).onmousedown = dragMouseDown;
			}

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				// get the mouse cursor position at startup
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				// call a function whenever the cursor moves
				document.onmousemove = elementDrag;
			}

			function closeDragElement() {
				// stop moving when mouse button is released
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				// calculate the new cursor position
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				// set the element's new position
				elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
				elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
			}
		}
		function resizeElement() {
			let elmnt = document.getElementById('TableWindowDrawing' + NumberOfTables.toString());
			let elmntParent = document.getElementById('TableWindow' + NumberOfTables.toString());
			let elmntTitleBarWindow = document.getElementById('TableWindowTitleBar' + NumberOfTables.toString());
			document.getElementById('TableResizer' + NumberOfTables.toString()).onmousedown = initDrag;
			
			function initDrag(e) {
				document.onmouseup = stopDrag;
				document.onmousemove = doDrag;
			}

			function stopDrag(e) {
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function doDrag(e) {
				elmnt.style.width = (e.clientX - elmntParent.offsetLeft) + "px";
				elmntTitleBarWindow.style.width = elmnt.style.width;
				elmnt.style.height = (e.clientY - (elmnt.offsetTop + elmntParent.offsetTop)) + "px";
			}
		}
		
		function addTableData() {
			let elem = document.getElementById('TableWindowDrawing' + NumberOfTables.toString());
			let TableElement = document.createElement('table');
			TableElement.id = "Table" + NumberOfTables.toString();
			
			// create the table and append it
			/*{ {},               (this is for reference)
				{15, 25, 35, 45},  ---cell--->          |
				{15, 25, 35},                          Row
				{10, 20, 30, 40, 50, 60, 70, 80, 90},   |
				{27, 29, 37, 48},                       v
				{32, 33, 39, 50, 51, 89} };*/
			// 1st get longest cell from top to bottom
			for (let row = 0, MaxRow = data.length, HighestCellValueEncountered = -1, cell = 0; row < MaxRow; row++) {
				if (data[row].length > HighestCellValueEncountered) {
					HighestCellValueEncountered = data[row].length;
					// 2nd print all cells up until this point
					while (cell < HighestCellValueEncountered) {
						let newRow = TableElement.insertRow();
						for (let row = 0; row < MaxRow; row++) { // 3rd print all rows, in that cell posision
							let newCell = newRow.insertCell();
							if (data[row][cell]) {
								if (addNumbers) {
									// do this if we add column that counts the number of rows
									// TODO: make a switch here-v (?) also, make so the 1st row if we have "addNumbers" test before this loop, so we can take away the condional statment "cell != 0", as this statment is overhead and can be optimised to be removed?
									let newText = document.createTextNode(data[row][cell]);
									if (data[row][cell][0] == '+' || data[row][cell] == 'Y' || data[row][cell] == "Buy" || data[row][cell] == "Strong Buy")
										newCell.className = "greentd";
									else if (data[row][cell][0] == '-' || data[row][cell] == 'N' || data[row][cell] == "Sell" || data[row][cell] == "Strong Sell" ||
											 data[row][cell] == "DR" || data[row][cell] == "ETF")
										newCell.className = "redtd";
									if (row == 9 && cell != 0) { //<--- todo, remove "cell != 0"!
										if (data[row][cell][data[row][cell].length-1] != 'M' && data[row][cell][data[row][cell].length-1] != 'K')
											newCell.className = "redtd";
										else if (data[row][cell][data[row][cell].length-1] == 'K' && parseFloat(data[row][cell]) < 21)
											newCell.className = "redtd";
									}
									if (row == 1 && cell != 0) { // if 2nd row, we add hyper link to ticker //<--- todo, remove "cell != 0"!
										let a = document.createElement('a');
										a.appendChild(newText);
										a.href = "https://finance.yahoo.com/quote/" + data[row][cell];
										newCell.appendChild(a);
									}
									else
										newCell.appendChild(newText);
								}
								else {
									let newText = document.createTextNode(data[row][cell]);
									if (data[row][cell][0] == '+' || data[row][cell] == 'Y' || data[row][cell] == "Buy" || data[row][cell] == "Strong Buy")
										newCell.className = "greentd";
									else if (data[row][cell][0] == '-' || data[row][cell] == 'N' || data[row][cell] == "Sell" || data[row][cell] == "Strong Sell")
										newCell.className = "redtd";
									if (row == 0 && cell != 0) { // if 1st row, we add hyper link to ticker
										let a = document.createElement('a');
										a.appendChild(newText);
										a.href = "https://finance.yahoo.com/quote/" + data[row][cell];
										newCell.appendChild(a);
									}
									else
										newCell.appendChild(newText);
									// todo... add same stuff here as above there---^
								}
							}
						}
						cell++;
					}
				}
			}
			elem.appendChild(TableElement);
		}
	}
	
	function addSearchForDisruption() {
		body.prepend( // Add div to page
					'<div id="SearchForDisruptionWindow' + NumberOfSearchForDisruptionWindows.toString() + '" class="Window">' +
						'<div id="SearchForDisruptionWindowTitleBar' + NumberOfSearchForDisruptionWindows.toString() + '" class="WindowTitleBar">' +
							'<button onclick="ToggleCmd(\'SearchForDisruptionWindowDrawing' + NumberOfSearchForDisruptionWindows.toString() + '\')">_</button>' +
							'<button onclick="DeleteElement(\'SearchForDisruptionWindow' + NumberOfSearchForDisruptionWindows.toString() + '\')">X</button>' +
						'</div>' +
						'<div id="SearchForDisruptionWindowDrawing' + NumberOfSearchForDisruptionWindows.toString() + '" class="SearchForDisruptionWindowDrawing">' +
							'<div id="SearchForDisruptionOutput' + NumberOfSearchForDisruptionWindows.toString() + '" class="SearchForDisruptionOutput"></div>' +
							'<button id="SearchForDisruptionFasterSpeed">+</button>' +
							'<button id="SearchForDisruptionSlowerSpeed">-</button>' +
							'<button id="SearchForDisruptionClear">Clear</button>' +
							'<div id="SearchForDisruptionSpeedDisplay">Speed:</div>' +
							'<input type="text" id="SearchForDisruptionSetSpeedInput" style="width: 70px;"/>' +
							'<button id="SearchForDisruptionSetSpeed">Set speed</button>' +
							'<div id="SearchForDisruptionPercentageProgress">Progress:0%</div>' +
						'</div>' +
						'<div id="SearchForDisruptionResizer' + NumberOfSearchForDisruptionWindows.toString() + '" class="resizer"> </div>' +
					'</div>');
		
		document.getElementById('SearchForDisruptionSpeedDisplay').innerHTML = "Speed:" + SearchForDisruptionDelayValue;
		document.getElementById('SearchForDisruptionFasterSpeed').onclick = function () {
			SearchForDisruptionDelayValue *= 0.5;
			if (SearchForDisruptionDelayValue < 1)
				SearchForDisruptionDelayValue = 1;
			document.getElementById('SearchForDisruptionSpeedDisplay').innerHTML = "Speed:" + SearchForDisruptionDelayValue;
		}
		document.getElementById('SearchForDisruptionSlowerSpeed').onclick = function () {
			SearchForDisruptionDelayValue *= 1.5;
			document.getElementById('SearchForDisruptionSpeedDisplay').innerHTML = "Speed:" + SearchForDisruptionDelayValue;
		}
		document.getElementById('SearchForDisruptionClear').onclick = function () {
			document.getElementById('SearchForDisruptionOutput' + (NumberOfSearchForDisruptionWindows-1).toString()).textContent = '';
		}
		document.getElementById('SearchForDisruptionSetSpeed').onclick = function () {
			let SearchForDisruptionDelayValueTemp = parseInt(document.getElementById('SearchForDisruptionSetSpeedInput').value);
			if (SearchForDisruptionDelayValueTemp < 1 || SearchForDisruptionDelayValueTemp !== SearchForDisruptionDelayValueTemp) // !== is to check for NaN
				SearchForDisruptionDelayValue = 1;
			else
				SearchForDisruptionDelayValue = SearchForDisruptionDelayValueTemp;
			document.getElementById('SearchForDisruptionSetSpeedInput').value = '';
			document.getElementById('SearchForDisruptionSpeedDisplay').innerHTML = "Speed:" + SearchForDisruptionDelayValue;
		}
		
		dragElement(document.getElementById("SearchForDisruptionWindow" + NumberOfSearchForDisruptionWindows.toString())); // Make the DIV element draggable
		resizeElement();
		// set timer to search for disruption
		/*let intervalID =*/ setTimeout(SearchForDisruption, SearchForDisruptionDelayValue);
		++NumberOfSearchForDisruptionWindows;
		return NumberOfSearchForDisruptionWindows-1;
		
		function dragElement(elmnt) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			if (document.getElementById('SearchForDisruptionWindowTitleBar' + NumberOfSearchForDisruptionWindows.toString())) {
				// if present, the header is where you move the DIV from:
				document.getElementById('SearchForDisruptionWindowTitleBar' + NumberOfSearchForDisruptionWindows.toString()).onmousedown = dragMouseDown;
			}

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				// get the mouse cursor position at startup
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				// call a function whenever the cursor moves
				document.onmousemove = elementDrag;
			}

			function closeDragElement() {
				// stop moving when mouse button is released
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				// calculate the new cursor position
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				// set the element's new position
				elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
				elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
			}
		}
		function resizeElement() {
			let elmnt = document.getElementById('SearchForDisruptionWindowDrawing' + NumberOfSearchForDisruptionWindows.toString());
			let elmntParent = document.getElementById('SearchForDisruptionWindow' + NumberOfSearchForDisruptionWindows.toString());
			let elmntTitleBarWindow = document.getElementById('SearchForDisruptionWindowTitleBar' + NumberOfSearchForDisruptionWindows.toString());
			document.getElementById('SearchForDisruptionResizer' + NumberOfSearchForDisruptionWindows.toString()).onmousedown = initDrag;
			
			function initDrag(e) {
				document.onmouseup = stopDrag;
				document.onmousemove = doDrag;
			}

			function stopDrag(e) {
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function doDrag(e) {
				elmnt.style.width = (e.clientX - elmntParent.offsetLeft) + "px";
				elmntTitleBarWindow.style.width = elmnt.style.width;
				elmnt.style.height = (e.clientY - (elmnt.offsetTop + elmntParent.offsetTop)) + "px";
			}
		}
	}
	function addMessageToSearchForDisruptionWindow(message) {
		let SearchForDisruptionElement = document.getElementById("SearchForDisruptionOutput" + (NumberOfSearchForDisruptionWindows-1).toString());
		if (SearchForDisruptionElement !== null) {
			let div = document.createElement("div");
			
			div.textContent += message;
			SearchForDisruptionElement.prepend(div);
		}
	}
	async function SearchForDisruption() {
		let n = 0, nn = SearchForDisruptionTickers.length-1;
		while (SearchForDisruptionRun) {
			//addMessageToSearchForDisruptionWindow(n);
			connection.send("Command:get ticket info " + SearchForDisruptionTickers[n][0]);

			if (n < nn) {
				n++;
				switch (n) {
					case SearchForDisruptionPercentageProgressValues[0]:
						document.getElementById('SearchForDisruptionPercentageProgress').innerHTML = "Progress:20%";
						break;
					case SearchForDisruptionPercentageProgressValues[1]:
						document.getElementById('SearchForDisruptionPercentageProgress').innerHTML = "Progress:40%";
						break;
					case SearchForDisruptionPercentageProgressValues[2]:
						document.getElementById('SearchForDisruptionPercentageProgress').innerHTML = "Progress:60%";
						break;
					case SearchForDisruptionPercentageProgressValues[3]:
						document.getElementById('SearchForDisruptionPercentageProgress').innerHTML = "Progress:80%";
						break;
					default:
						break;
				}
			}
			else {
				n = 0;
				document.getElementById('SearchForDisruptionPercentageProgress').innerHTML = "Progress:0%";
			}
			// wait some time
			await new Promise(r => setTimeout(r, SearchForDisruptionDelayValue));
		}
	}
	
	function addTableTimer() {
		body.prepend( // Add div to page
					'<div id="TableTimerWindow' + NumberOfTableTimerWindows.toString() + '" class="Window">' +
						'<div id="TableTimerTitleBar' + NumberOfTableTimerWindows.toString() + '" class="WindowTitleBar">' +
							'<button onclick="ToggleCmd(\'TableTimerWindowDrawing' + NumberOfTableTimerWindows.toString() + '\')">_</button>' +
							'<button onclick="DeleteElement(\'TableTimerWindow' + NumberOfTableTimerWindows.toString() + '\')">X</button>' +
						'</div>' +
						'<div id="TableTimerWindowDrawing' + NumberOfTableTimerWindows.toString() + '" class="TableWindowDrawing">' +
							'<button id="TableTimerFasterSpeed">+</button>' +
							'<button id="TableTimerSlowerSpeed">-</button>' +
							'<div id="TableTimerSpeedDisplay">Speed:</div>' +
							'<input type="text" id="TableTimerSetSpeedInput" style="width: 70px;"/>' +
							'<button id="TableTimerSetSpeed">Set speed</button>' +
							'<input type="text" id="TableTimerTicker" style="width: 70px;"/>' +
							'<button id="TableTimerAddTicker">Add ticker</button>' +
							'<table id="TableTimerTable">' + // <----------------------------------------need to add ' + NumberOfTableTimerWindows.toString()'!!!
							'<tr><td>Ticker</td><td>Value at start</td><td>Current Value</td><td><button id="TableTimerClear">Clear</button></td><td><button id="TableTimerReset">Reset</button></td><td>tradingview</td><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td></tr>' +
							'</table>' + //<-------add default values, for colums!!!
						'</div>' +
						'<div id="TableTimerResizer' + NumberOfTableTimerWindows.toString() + '" class="resizer"> </div>' +
					'</div>');
		
		document.getElementById('TableTimerSpeedDisplay').innerHTML = "Speed:" + TableTimerDelayValue;
		document.getElementById('TableTimerFasterSpeed').onclick = function () {
			TableTimerDelayValue *= 0.5;
			if (TableTimerDelayValue < 1)
				TableTimerDelayValue = 1;
			document.getElementById('TableTimerSpeedDisplay').innerHTML = "Speed:" + TableTimerDelayValue;
		}
		document.getElementById('TableTimerSlowerSpeed').onclick = function () {
			TableTimerDelayValue *= 1.5;
			document.getElementById('TableTimerSpeedDisplay').innerHTML = "Speed:" + TableTimerDelayValue;
		}
		document.getElementById('TableTimerSetSpeed').onclick = function () {
			let TableTimerDelayValueTemp = parseInt(document.getElementById('TableTimerSetSpeedInput').value);
			if (TableTimerDelayValueTemp < 1 || TableTimerDelayValueTemp !== TableTimerDelayValueTemp) // !== is to check for NaN
				TableTimerDelayValue = 100;
			else
				TableTimerDelayValue = TableTimerDelayValueTemp;
			document.getElementById('TableTimerSetSpeedInput').value = '';
			document.getElementById('TableTimerSpeedDisplay').innerHTML = "Speed:" + TableTimerDelayValue;
		}
		document.getElementById('TableTimerAddTicker').onclick = TableTimerAddTicker;
		document.getElementById('TableTimerClear').onclick = function () {
			TableTimerTickers = [];
			TempTableTimerTickers = [];
			TableTimerTickersLength = 0;
			
			let table = document.getElementById("TableTimerTable");
			while (table.rows.length > 1) {
				table.deleteRow(1);
			}
		}
		document.getElementById('TableTimerReset').onclick = async function () { // reset all tickers
			let m = 0, b = 2;
			while (m < TableTimerTickersLength) {
				connection.send("Command:reset ticker info table timer " + TableTimerTickers[m][0]);
				await new Promise(b => setTimeout(b, 2000)); // wait some time
				m++;
			}
		}
		
		dragElement(document.getElementById("TableTimerWindow" + NumberOfTableTimerWindows.toString())); // Make the DIV element draggable
		resizeElement();
		setTimeout(TableTimerLoop, TableTimerDelayValue);
		++NumberOfTableTimerWindows;
		return NumberOfTableTimerWindows-1;
		
		function dragElement(elmnt) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			if (document.getElementById('TableTimerTitleBar' + NumberOfTableTimerWindows.toString())) {
				// if present, the header is where you move the DIV from:
				document.getElementById('TableTimerTitleBar' + NumberOfTableTimerWindows.toString()).onmousedown = dragMouseDown;
			}

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				// get the mouse cursor position at startup
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				// call a function whenever the cursor moves
				document.onmousemove = elementDrag;
			}

			function closeDragElement() {
				// stop moving when mouse button is released
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				// calculate the new cursor position
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				// set the element's new position
				elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
				elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
			}
		}
		function resizeElement() {
			let elmnt = document.getElementById('TableTimerWindowDrawing' + NumberOfTableTimerWindows.toString());
			let elmntParent = document.getElementById('TableTimerWindow' + NumberOfTableTimerWindows.toString());
			let elmntTitleBarWindow = document.getElementById('TableTimerTitleBar' + NumberOfTableTimerWindows.toString());
			document.getElementById('TableTimerResizer' + NumberOfTableTimerWindows.toString()).onmousedown = initDrag;
			
			function initDrag(e) {
				document.onmouseup = stopDrag;
				document.onmousemove = doDrag;
			}

			function stopDrag(e) {
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function doDrag(e) {
				elmnt.style.width = (e.clientX - elmntParent.offsetLeft) + "px";
				elmntTitleBarWindow.style.width = elmnt.style.width;
				elmnt.style.height = (e.clientY - (elmnt.offsetTop + elmntParent.offsetTop)) + "px";
			}
		}
		
		async function TableTimerLoop() { // this loop is shit and need to be better, so that it does not break, dynamically!
			let n = 0, TempValue;
			while (TableTimerRun) {
				if (TableTimerTickersLength) {
					if (TableTimerTickers[n]) {
						TempValue = TableTimerTickers[n][0];
						if (TempValue)
							connection.send("Command:get ticker info table timer " + TempValue);
					}
					
					n++;
					if (n >= TableTimerTickersLength)
						n = 0;
				}
				
				// wait some time
				await new Promise(r => setTimeout(r, TableTimerDelayValue));
			}
		}
	}
	function TableTimerAddTicker(Ticker) {
		let TickerName;
		if (typeof Ticker == "string") // if we have a argument value, use it instead of looking for the value
			TickerName = Ticker;
		else {
			TickerName = document.getElementById('TableTimerTicker').value;
			if (TickerName == "") // do not add anything if empty string
				return;
		}
		
		let DidNotFoundTheTicker = true;
		for (let m = 0, mm = TempTableTimerTickers.length; m < mm && DidNotFoundTheTicker; m++)
			if (TempTableTimerTickers[m] == TickerName)
				DidNotFoundTheTicker = false;
		
		if (DidNotFoundTheTicker) {
			for (let m = 0, mm = TableTimerTickers.length; m < mm && DidNotFoundTheTicker; m++)
				if (TableTimerTickers[m][0] == TickerName)
					DidNotFoundTheTicker = false;
			
			if (DidNotFoundTheTicker) {
				TempTableTimerTickers.push(TickerName);
				
				// add row to table
				let ElemTable = document.getElementById('TableTimerTable');
				let newRow = ElemTable.insertRow();
				newRow.id = "TableTimerRow" + TickerName;
				let TickerCell = newRow.insertCell();
				let TickerText = document.createTextNode(TickerName);
				let a = document.createElement('a');
				a.appendChild(TickerText);
				a.href = "https://finance.yahoo.com/quote/" + TickerName;
				TickerCell.appendChild(a);
				let AtStartCell = newRow.insertCell();
				AtStartCell.id = "TableTimerAtStartCell" + TickerName;
				let CurrentValueCell = newRow.insertCell();
				CurrentValueCell.id = "TableTimerCurrentValue" + TickerName;
				let DeleteCell = newRow.insertCell();
				let Button0 = document.createElement("button");
				Button0.innerHTML = "Del";
				Button0.onclick = function () {
					let m = 0, DidNotFoundTicker = true;
					let mm = TableTimerTickers.length;
					while (m < mm && DidNotFoundTicker)
						if (TableTimerTickers[m][0] == TickerName)
							DidNotFoundTicker = false;
						else
							m++;
					if (!DidNotFoundTicker) {
						TableTimerTickersLength--;
						TableTimerTickers.splice(m, 1);
						
						let x = document.getElementById("TableTimerRow" + TickerName);
						x.remove();
					}
				}
				DeleteCell.appendChild(Button0);
				let ResetTickerCell = newRow.insertCell();
				let Button1 = document.createElement("button");
				Button1.innerHTML = "Reset";
				Button1.onclick = function () {
					connection.send("Command:reset ticker info table timer " + TickerName);
				}
				ResetTickerCell.appendChild(Button1);
				let TradingviewInfoCell = newRow.insertCell();
				TradingviewInfoCell.id = "TableTimerTradingviewInfo" + TickerName;
				let CheckboxCell = newRow.insertCell();
				let Input = document.createElement("input");
				Input.type = "checkbox";
				CheckboxCell.appendChild(Input);
				
				connection.send("Command:new get ticker info table timer " + TickerName);
			}
		}
		
		document.getElementById('TableTimerTicker').value = '';
	}
	async function AddTableGainToTableTimer(data, special) {
		let b = 2;
		for (let p = 1, pp = data.length; p < pp; p++) {
			if (special[p] == "") { // we do not want to add special tickers
				TableTimerAddTicker(data[p]);
				await new Promise(b => setTimeout(b, 2000));
			}
		}
	}
	
	function addFromStartToNowGain() {
		body.prepend( // Add div to page
					'<div id="FromStartToNowGainWindow' + NumberOfFromStartToNowGainWindows.toString() + '" class="Window">' +
						'<div id="FromStartToNowGainTitleBar' + NumberOfSearchForDisruptionWindows.toString() + '" class="WindowTitleBar">' +
							'<button onclick="ToggleCmd(\'FromStartToNowGainWindowDrawing' + NumberOfSearchForDisruptionWindows.toString() + '\')">_</button>' +
							'<button onclick="DeleteElement(\'FromStartToNowGainWindow' + NumberOfSearchForDisruptionWindows.toString() + '\')">X</button>' +
						'</div>' +
						'<div id="FromStartToNowGainWindowDrawing' + NumberOfSearchForDisruptionWindows.toString() + '" class="SearchForDisruptionWindowDrawing">' +
							'<button id="FromStartToNowGainFasterSpeed">+</button>' +
							'<button id="FromStartToNowGainSlowerSpeed">-</button>' +
							'<button id="FromStartToNowGainClear">Clear</button>' +
							'<div id="FromStartToNowGainSpeedDisplay">Speed:</div>' +
							'<input type="text" id="FromStartToNowGainSetSpeedInput" style="width: 70px;"/>' +
							'<button id="FromStartToNowGainSetSpeed">Set speed</button>' +
							'<div id="FromStartToNowGainPercentageProgress">Progress:0%</div>' +
							'How many min to look back:<input type="text" id="FromStartToNowGainMinToLookBack" style="width: 70px;"/>' +
							'<button id="FromStartToNowGainSetMinToLookBack">Set</button>' +
							'<div id="FromStartToNowGainCurrentMinToLookBack">Min to look back at:</div>' +
							' Option:<input type="text" id="FromStartToNowGainOption" style="width: 70px;"/>(1:search from start to now 2:choose time back in min to now 3:from absolute bottom to now) ' +
							'<button id="FromStartToNowGainSetOption">Set option</button>' +
							'<div id="FromStartToNowGainCurrentOption">Current option:</div>' +
							'<div id="FromStartToNowGainStatus">Current status:</div>' +
							'<table id="FromStartToNowGainTable">' +
							'<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td><td>Ticker</td><td>&nbsp;&nbsp;%&nbsp;&nbsp;</td></tr>' +
							'</table>' +
						'</div>' +
						'<div id="FromStartToNowGainResizer' + NumberOfSearchForDisruptionWindows.toString() + '" class="resizer"> </div>' +
					'</div>');
		
		connection.send("Command:from start to now gain get speed");
		connection.send("Command:from start to now gain get min to look back");
		connection.send("Command:from start to now gain get option");
		document.getElementById('FromStartToNowGainClear').onclick = function () {
			delFromStartToNowGainTable();
		}
		document.getElementById('FromStartToNowGainFasterSpeed').onclick = function () {
			connection.send("Command:from start to now gain change speed faster");
		}
		document.getElementById('FromStartToNowGainSlowerSpeed').onclick = function () {
			connection.send("Command:from start to now gain change speed slower");
		}
		document.getElementById('FromStartToNowGainSetSpeed').onclick = function () {
			let NewSpeed = parseInt(document.getElementById('FromStartToNowGainSetSpeedInput').value);
			if (NewSpeed < 1 || NewSpeed !== NewSpeed) // !== is to check for NaN
				NewSpeed = 1;
			document.getElementById('FromStartToNowGainSetSpeedInput').value = '';
			connection.send("Command:from start to now gain set speed " + NewSpeed);
		}
		document.getElementById('FromStartToNowGainSetMinToLookBack').onclick = function () {
			let NewTime = parseInt(document.getElementById('FromStartToNowGainMinToLookBack').value);
			if (NewTime < 1 || NewTime !== NewTime) // !== is to check for NaN
				NewTime = 10;
			document.getElementById('FromStartToNowGainMinToLookBack').value = '';
			connection.send("Command:from start to now gain set time to look back " + NewTime);
		}
		document.getElementById('FromStartToNowGainSetOption').onclick = function () {
			let NewOption = parseInt(document.getElementById('FromStartToNowGainOption').value);
			if (NewOption < 1 || NewOption > 3 || NewOption !== NewOption) // !== is to check for NaN
				NewOption = 1;
			document.getElementById('FromStartToNowGainOption').value = '';
			connection.send("Command:from start to now gain set option " + NewOption);
		}
		
		dragElement(document.getElementById("FromStartToNowGainWindow" + NumberOfFromStartToNowGainWindows.toString())); // Make the DIV element draggable
		resizeElement();
		++NumberOfFromStartToNowGainWindows;
		connection.send("Command:from start to now gain made window");
		return NumberOfFromStartToNowGainWindows-1;
		
		function dragElement(elmnt) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			if (document.getElementById('FromStartToNowGainTitleBar' + NumberOfFromStartToNowGainWindows.toString())) {
				// if present, the header is where you move the DIV from:
				document.getElementById('FromStartToNowGainTitleBar' + NumberOfFromStartToNowGainWindows.toString()).onmousedown = dragMouseDown;
			}

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				// get the mouse cursor position at startup
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				// call a function whenever the cursor moves
				document.onmousemove = elementDrag;
			}

			function closeDragElement() {
				// stop moving when mouse button is released
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				// calculate the new cursor position
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				// set the element's new position
				elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
				elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
			}
		}
		function resizeElement() {
			let elmnt = document.getElementById('FromStartToNowGainWindowDrawing' + NumberOfFromStartToNowGainWindows.toString());
			let elmntParent = document.getElementById('FromStartToNowGainWindow' + NumberOfFromStartToNowGainWindows.toString());
			let elmntTitleBarWindow = document.getElementById('FromStartToNowGainTitleBar' + NumberOfFromStartToNowGainWindows.toString());
			document.getElementById('FromStartToNowGainResizer' + NumberOfFromStartToNowGainWindows.toString()).onmousedown = initDrag;
			
			function initDrag(e) {
				document.onmouseup = stopDrag;
				document.onmousemove = doDrag;
			}

			function stopDrag(e) {
				document.onmouseup = null;
				document.onmousemove = null;
			}
			function doDrag(e) {
				elmnt.style.width = (e.clientX - elmntParent.offsetLeft) + "px";
				elmntTitleBarWindow.style.width = elmnt.style.width;
				elmnt.style.height = (e.clientY - (elmnt.offsetTop + elmntParent.offsetTop)) + "px";
			}
		}
	}
	function delFromStartToNowGainTable() {
		let TableElement = document.getElementById('FromStartToNowGainTable');
		
		while (TableElement.rows.length > 1) {
			TableElement.deleteRow(1);
		}
	}
	function addFromStartToNowGainTable(TableData) {
		console.log(TableData);
		
		delFromStartToNowGainTable();
		let TableElement = document.getElementById('FromStartToNowGainTable');
		
		for (let row = 0, MaxRow = TableData.length; row < MaxRow; row++) {
			let newRow = TableElement.insertRow();
			// 1st add number
			let newCell0 = newRow.insertCell();
			let newText0 = document.createTextNode(row+1);
			newCell0.appendChild(newText0);
			// 2nd add ticker
			let newCell1 = newRow.insertCell();
			let newText1 = document.createTextNode(TableData[row][0]);
			let a = document.createElement('a');
			a.appendChild(newText1);
			a.href = "https://finance.yahoo.com/quote/" + TableData[row][0];
			newCell1.appendChild(a);
			// 3rd add % value
			let newCell2 = newRow.insertCell();
			let newText2 = document.createTextNode(Math.round(TableData[row][1]*100));
			newCell2.className = "greentd";
			newCell2.appendChild(newText2);
		}
	}
	function addFromBottomToNowGain() {
		
	}
	
	function getTradeviewRating(ticker) {
		
	}
});
