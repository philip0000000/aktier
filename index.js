"use strict";

const readline = require('readline');
const puppeteer = require('puppeteer');
const FtpClient = require('ftp');
const fs = require('fs');
const rl = readline.createInterface({input: process.stdin, output: null, });
const mysql = require('mysql');
// -for websocket-
const http = require('http');
const webSocketServer = require('websocket').server;
//---------------------------------
let util = require('util');
let events = require('events');

// ---Global variables---
let global_page; // for web crawler
let browserInstance; // for web crawler
let connection; // for MySQL
let AreWeConnectedToNasdaqusa = false;
// -for websocket(cli http interface)-
let webSocketsServerPort = 1337; // Port where we'll run the websocket server
let history = []; // latest 100 messages
let clients = []; // list of currently connected clients (users)
let server; // HTTP server
let wsServer; // WebSocket server

let FromStartToNowGainDelayValue = 1000;
let FromStartToNowGainCurrentMinToLookBack = 30;
let FromStartToNowGainOption = 1; // 1:search from start to now 2:choose time back in min to now 3:from absolute bottom to now
let FromStartToNowGainChangedOption = false;
let FromStartToNowGainTickers;
let FromStartToNowGainPercentageProgressValue;
let FromStartToNowGainRun = true;


function ClearConsoleIO() {
	rl.close();
}
function askQuestion(query) {
	rl.resume();
    return new Promise(resolve => rl.question("", ans => {
        rl.pause();
        resolve(ans);
    }));
}

// Start the browser and create a browser instance
async function startBrowser() {
	try {
        console.log("Opening the browser...");
        browserInstance = await puppeteer.launch({
            headless: false, //true,
            args: ["--disable-setuid-sandbox"],
            'ignoreHTTPSErrors': true
        });
    } catch (err) {
        console.log("Could not create a browser instance => : ", err);
    }
}
async function closeBrowser() {
	await browserInstance.close();
}


let http_files = [];
function StartHttpServer() {
	[
		["/frontend/jquery.min.js","application/javascript"],
		["/frontend/frontend.js","application/javascript"],
		["/frontend/frontend.html","text/html"]
	].forEach(function(fn){
		http_files[fn[0]]={
			content : fs.readFileSync('.'+fn[0]).toString(),
			contentType : fn[1]
		};
	});
	http_files["/"]=http_files["/frontend/frontend.html"];
	http_files["/index.html"]=http_files["/frontend/frontend.html"];
	
	server = http.createServer(function(request, response) {
		// this doubles as a way to serve the fies, and a connection for websocket to use
		let file = http_files[request.url];
		if (file) {
			response.writeHeader(200, {"content-type" : file.contentType});
			response.write(file.content);
			return response.end();
		}
		response.writeHeader(404, {"content-type" : "text/plain"});
		response.write("404 - not found");
		return response.end();
	});
	
	server.listen(webSocketsServerPort, function() {
		console.log((new Date()) + " Server is listening on port http://127.0.0.1:" + webSocketsServerPort); //http://127.0.0.1:1337/
	});
}

// Helper function for escaping input strings
function htmlEntities(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
					  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function BroadcastMessage(obj) {
	let json = JSON.stringify(obj);
	
	// broadcast message to all connected clients
	for (let i = 0; i < clients.length; i++) {
		clients[i].sendUTF(json); // TODO: check before using "sendUTF" if the connection is connected
	}
}
function StartWebSocketServer() {
	wsServer = new webSocketServer({
		// WebSocket server is tied to a HTTP server. WebSocket request is just
		// an enhanced HTTP request. For more info http://tools.ietf.org/html/rfc6455#page-6
		httpServer: server
	});
	
	// This callback function is called every time someone tries to connect to the WebSocket server
	wsServer.on('request', function(request) {
		console.log((new Date()) + ' Connection from origin ' + request.origin);

		// accept connection - you should check 'request.origin' to make sure that
		// client is connecting from your website
		// (http://en.wikipedia.org/wiki/Same_origin_policy)
		var connection = request.accept(null, request.origin); 
		// we need to know client index to remove them on 'close' event
		let index = clients.push(connection) - 1;

		console.log((new Date()) + ' Connection accepted');

		// user sent some message
		connection.on('message', async function(message) {
			if (message.type === 'utf8') { // accept only text
				let type = '';
				let msg = '';
				
				let n = 0, nn = message.utf8Data.length;
				while (message.utf8Data[n] != ':' && n < nn) {
					type += message.utf8Data[n];
					n++;
				}
				if (message.utf8Data[n] == ':') {
					n++;
					
					while (n < nn) {
						msg += message.utf8Data[n];
						n++;
					}
					
					if (type == "Command") {
						switch (msg) {
							case "send chat history to newest cmd window":
								let obj = {
									time: (new Date()).getTime(),
									text: "New cmd created",
								};
								history.push(obj);
								history = history.slice(-100);
							
								BroadcastMessage( { type: 'send chat history to newest cmd window', data: history } );
								break;
							case "from start to now gain made window":
								FromStartToNowGainPercentageProgressValue = FromStartToNowGainTickers.length / 50;
								//FromStartToNowGainTickers = await GetAllTickersMarketOpenValue(FromStartToNowGainTickers);
								//FromStartToNowGainPercentageProgressValue = FromStartToNowGainTickers.length / 50;
								
								FromStartToNowGainOption = 2;
								BroadcastMessage( { type: 'command', action: 'from start to now gain set option', data: FromStartToNowGainOption } );
								
								setTimeout(FromStartToNowGainLoop, FromStartToNowGainDelayValue);
								break;
							case "from start to now gain get speed":
								BroadcastMessage( { type: 'command', action: 'from start to now gain set speed', data: FromStartToNowGainDelayValue } );
								break;
							case "from start to now gain get min to look back":
								BroadcastMessage( { type: 'command', action: 'from start to now gain set min to look back', data: FromStartToNowGainCurrentMinToLookBack } );
								break;
							case "from start to now gain get option":
								BroadcastMessage( { type: 'command', action: 'from start to now gain set option', data: FromStartToNowGainOption } );
								break;
							case "from start to now gain change speed faster":
								FromStartToNowGainDelayValue *= 0.5;
								if (FromStartToNowGainDelayValue < 1)
									FromStartToNowGainDelayValue = 1;
								BroadcastMessage( { type: 'command', action: 'from start to now gain set speed', data: FromStartToNowGainDelayValue } );
								break;
							case "from start to now gain change speed slower":
								FromStartToNowGainDelayValue *= 1.5;
								BroadcastMessage( { type: 'command', action: 'from start to now gain set speed', data: FromStartToNowGainDelayValue } );
								break;
							default:
								if (msg.startsWith("get ticket info ")) {
									let ticker = msg.substr(16);
									BroadcastMessage( { type: 'search for disruptions message', data: await GetStockChartYahoo(ticker) } );
								}
								else if (msg.startsWith("get ticker info table timer ")) {
									let ticker = msg.substr(28);
									BroadcastMessage( { type: 'table timer ticker current value', data: [ticker, await GetRegularMarketPriceYahoo(ticker), await GetTradingviewInfoSummaryNow(ticker)] } );
								}
								else if (msg.startsWith("new get ticker info table timer ")) {
									let ticker = msg.substr(32);
									BroadcastMessage( { type: 'new table timer ticker', data: [ticker, await GetRegularMarketPriceYahoo(ticker), await GetTradingviewInfoSummaryNow(ticker)] } );
								}
								else if (msg.startsWith("reset ticker info table timer ")) {
									let ticker = msg.substr(30);
									BroadcastMessage( { type: 'reset table timer ticker', data: [ticker, await GetRegularMarketPriceYahoo(ticker)] } );
								}
								else if (msg.startsWith("from start to now gain set speed ")) {
									FromStartToNowGainDelayValue = msg.substr(33);
									BroadcastMessage( { type: 'command', action: 'from start to now gain set speed', data: FromStartToNowGainDelayValue } );
								}
								else if (msg.startsWith("from start to now gain set time to look back ")) {
									FromStartToNowGainCurrentMinToLookBack = msg.substr(45);
									BroadcastMessage( { type: 'command', action: 'from start to now gain set min to look back', data: FromStartToNowGainCurrentMinToLookBack } );
								}
								else if (msg.startsWith("from start to now gain set option ")) {
									FromStartToNowGainOption = msg.substr(34);
									BroadcastMessage( { type: 'command', action: 'from start to now gain set option', data: FromStartToNowGainOption } );
									FromStartToNowGainChangedOption = true;
									BroadcastMessage( { type: 'command', action: 'from start to now gain status', data: 2 } );
								}
								break;
						}
					}
					else if (type == "Message") {
						// we want to keep history of all sent messages
						let obj = {
							time: (new Date()).getTime(),
							text: htmlEntities(msg),
						};
						history.push(obj);
						history = history.slice(-100);
						
						BroadcastMessage( { type: 'message', data: obj } );
						
						// execute any command that exist in the message
						switch (msg) {
							case "alert":
								BroadcastMessage( { type: 'command', action: 'alert' } );
								break;
							case "create cmd":
								BroadcastMessage( { type: 'command', action: 'create cmd' } );
								break;
							case "create line chart":
								BroadcastMessage( { type: 'command', action: 'create line chart' } );
								break;
							case "get trading hours":
								{
									let ReturnData;
									ReturnData = await YahooGetNASDAQTradingHours();
									BroadcastMessage( { type: 'command', action: 'get trading hours', data: ReturnData } );
								}
								break;
							case "search for disruptions":
								{
									let ReturnData = await getFilteredNasdaqTickerList("only Common Stock");
									BroadcastMessage( { type: 'command', action: 'search for disruptions', data: ReturnData } );
								}
								break;
							case "search for disruptions toggle status":
								BroadcastMessage( { type: 'command', action: 'search for disruptions toggle status' } );
								break;
							case "add table timer":
								BroadcastMessage( { type: 'command', action: 'add table timer' } );
								break;
							case "from start to now gain":
								{
									let ReturnData = await getFilteredNasdaqTickerList("only tickers Common Stock");
									if (ReturnData == -1)
										BroadcastMessage( { type: 'command', action: 'from start to now gain', data: -1 } ); // error
									else {
										FromStartToNowGainTickers = ReturnData;
										BroadcastMessage( { type: 'command', action: 'from start to now gain', data: 1 } );
									}
								}
								break;
							case "get table gain usa to table timer":
								{
									let ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-gainers/");
									BroadcastMessage( { type: 'command', action: 'get table gain usa to table timer', data: ReturnData } );
								}
								break;
							case "get table loser usa to table timer":
								{
									let ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-losers/");
									BroadcastMessage( { type: 'command', action: 'get table loser usa to table timer', data: ReturnData } );
								}
								break;
							case "get table most active usa to table timer":
								{
									let ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-active/");
									BroadcastMessage( { type: 'command', action: 'get table most active usa to table timer', data: ReturnData } );
								}
								break;
							case "get table most volatile usa to table timer":
								{
									let ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-most-volatile/");
									BroadcastMessage( { type: 'command', action: 'get table most volatile usa to table timer', data: ReturnData } );
								}
								break;
							case "get table most overbought usa to table timer":
								{
									let ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-overbought/");
									BroadcastMessage( { type: 'command', action: 'get table most overbought usa to table timer', data: ReturnData } );
								}
								break;
							case "get table most oversold usa to table timer":
								{
									let ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-oversold/");
									BroadcastMessage( { type: 'command', action: 'get table most oversold usa to table timer', data: ReturnData } );
								}
								break;
							case "get VIX to table timer":
								BroadcastMessage( { type: 'command', action: 'get VIX to table timer' } );
								break;
							default:
								if (msg.startsWith("get stock ")) {
									let ticker = msg.substr(10);
									let ReturnData;
									if (!ticker)
										ReturnData = "ERROR! No ticker input.";
									else {
										ReturnData = await GetStockChartYahoo(ticker);
										if (typeof ReturnData != "object") //<-------------------------------------------------- DOES NOT WORK!
											ReturnData = "ERROR! The ticker does not exist.";
									}
									BroadcastMessage( { type: 'command', action: 'get stock', data: ReturnData } );
								}
								else if (msg.startsWith("get table ")) {
									let TableToGet = msg.substr(10);
									switch(TableToGet) {
										case "gain usa":
											{
												let ReturnData;
												ReturnData = await GetTradingviewTable("https://www.tradingview.com/markets/stocks-usa/market-movers-gainers/");
												if (ReturnData != -1) {
													ReturnData = await ProcessingTickerValueOnTable(ReturnData);
													BroadcastMessage( { type: 'command', action: 'get table', data: ReturnData } );
												}
												else
													BroadcastMessage( { type: 'command', action: 'get table', data: -1 } );
											}
											break;
										default:
											BroadcastMessage( { type: 'command', action: 'get table', data: [["stuff", "bad", "ok", "good"], ["idk", 1, 2, 3]] } );
											break;
									}
								}
								else if (msg.startsWith("text add ")) {
									let TableToGet = msg.substr(9);
									BroadcastMessage( { type: 'command', action: 'text add', data: TableToGet } );
								}
								else if (msg.startsWith("search for disruptions set time ")) {
									let TableToGet = msg.substr(32);
									BroadcastMessage( { type: 'command', action: 'search for disruptions set time', data: +TableToGet } );
								}
								else if (msg.startsWith("tradeview info ")) {
									let Ticker = msg.substr(15);
									BroadcastMessage( { type: 'command', action: 'tradeview info', data: [Ticker, await GetTradingviewInfo(Ticker)] } );
								}
								else if (msg.startsWith("simplywall info ")) {
									let Ticker = msg.substr(16);
									
								}
								else if (msg.startsWith("info ")) {
									let Ticker = msg.substr(5);
									
								}
								break;
						}
					}
					//else
						// error
				}
				//else
					// there was no type in the message, this is a error!
			}
		});

		connection.on('close', function(connection) { // user disconnected
			//console.log(connection);
			//console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
			clients.splice(index, 1); // remove user from the list of connected clients
		});

	});
}

function StartWebCli() {
	StartHttpServer();
	StartWebSocketServer();
}

// =================================================================================================
function eventFire(el, etype){
  if (el.fireEvent) {
    el.fireEvent('on' + etype);
  } else {
    let evObj = document.createEvent('Events');
    evObj.initEvent(etype, true, false);
    el.dispatchEvent(evObj);
  }
}

// processing: =====================================================================================
async function GetAllTickersMarketOpenValue(tickers) {
	let ReturnArr = [];
	let n = 0, nn = tickers.length, m = 0, returnValue;
	
	// let returnValue = GetStockChartYahoo();
	
	BroadcastMessage( { type: 'command', action: 'from start to now gain status', data: 1 } );
	
	while (n < nn) {
		returnValue = await GetRegularMarketOpenYahoo(tickers[n]);
		if (returnValue) { // no null values are added
			ReturnArr.push([tickers[n], returnValue]);
		}
		
		if (m > FromStartToNowGainPercentageProgressValue) {
			BroadcastMessage( { type: 'command', action: 'from start to now gain set percentage progress', data: Math.round((n/nn)*100) } );
			m = 0;
		}
		else
			m++;
		n++;
	}
	
	BroadcastMessage( { type: 'command', action: 'from start to now gain status', data: 0 } );
	
	return ReturnArr;
}
async function FromStartToNowGainLoop() {
	let n = 0, nn = FromStartToNowGainTickers.length,
	m = 0, TickerValueNow, TheDifference, InPercentage;
	
	// set time in the past to aim for, for option 2
	TickerValueNow = await GetStockChartYahoo("AMD"); // we just want the time right now, AMD is just popular ticker, nothing else -thus it was choosen
	let PastTickerValueTime = TickerValueNow.timestamp[TickerValueNow.timestamp.length-1] - FromStartToNowGainCurrentMinToLookBack * 60;
	let PastTickerValue;
	console.log("PastTickerValueTime: " + PastTickerValueTime);
	
	let FromStartToNowGainTop100Tickers = [], FromStartToNowGainLowestValueOfTheTop;
	while (FromStartToNowGainRun) {
		if (n < nn) {
			switch (FromStartToNowGainOption) {
				default:
				case 1:
					TickerValueNow = await GetRegularMarketPriceYahoo(FromStartToNowGainTickers[n][0]);
					if (TickerValueNow > FromStartToNowGainTickers[n][1]) { // we only care about positive values
						TheDifference = TickerValueNow - FromStartToNowGainTickers[n][1];
						InPercentage = TheDifference / TickerValueNow;
						if (FromStartToNowGainTop100Tickers.length == 100) {
							if (InPercentage > FromStartToNowGainLowestValueOfTheTop) {
								let l = 0;
								while (l < 100 && FromStartToNowGainTop100Tickers[l][1] != FromStartToNowGainLowestValueOfTheTop)
									l++;
								
								FromStartToNowGainTop100Tickers.splice(l, 1);
								FromStartToNowGainTop100Tickers.push([FromStartToNowGainTickers[n][0], InPercentage]);
								
								// find lowest value
								FromStartToNowGainLowestValueOfTheTop = 999999;
								for (l = 0; l < 100; l++)
									if (FromStartToNowGainTop100Tickers[l][1] < FromStartToNowGainLowestValueOfTheTop)
										FromStartToNowGainLowestValueOfTheTop = FromStartToNowGainTop100Tickers[l][1];
							}
						}
						else {
							FromStartToNowGainTop100Tickers.push([FromStartToNowGainTickers[n][0], InPercentage]);
							// find lowest value
							if (FromStartToNowGainTop100Tickers.length == 100) {
								FromStartToNowGainLowestValueOfTheTop = 999999;
								for (let l = 0; l < 100; l++)
									if (FromStartToNowGainTop100Tickers[l][1] < FromStartToNowGainLowestValueOfTheTop)
										FromStartToNowGainLowestValueOfTheTop = FromStartToNowGainTop100Tickers[l][1];
							}
						}
					}
					break;
				case 2:
					TickerValueNow = await GetStockChartYahoo(FromStartToNowGainTickers[n]);
					if (TickerValueNow != -1)
						if (TickerValueNow.timestamp) { // we only want tickers with timestamp, otherwise the ticker is empty
							console.log(FromStartToNowGainTickers[n]);
							let p = TickerValueNow.timestamp.length-1;
							while (p >= 0 && (TickerValueNow.timestamp[p] == null || TickerValueNow.timestamp[p] > PastTickerValueTime)) // get timestamp value that is lower then PastTickerValueTime
								--p;
							while (p >= 0 && TickerValueNow.indicators.quote[0].open[p] == null) // go to lowest, if we dont find a value
								--p;
							if (p >= 0) {
								PastTickerValue = TickerValueNow.indicators.quote[0].open[p];
								TickerValueNow = TickerValueNow.indicators.quote[0].open[TickerValueNow.timestamp.length-1];
								if (TickerValueNow > PastTickerValue) { // we only care about positive values
									TheDifference = TickerValueNow - PastTickerValue;
									InPercentage = TheDifference / TickerValueNow;
									if (FromStartToNowGainTop100Tickers.length == 100) {
										if (InPercentage > FromStartToNowGainLowestValueOfTheTop) {
											let l = 0;
											while (l < 100 && FromStartToNowGainTop100Tickers[l][1] != FromStartToNowGainLowestValueOfTheTop)
												l++;
											
											FromStartToNowGainTop100Tickers.splice(l, 1);
											FromStartToNowGainTop100Tickers.push([FromStartToNowGainTickers[n][0], InPercentage]);
											
											// find lowest value
											FromStartToNowGainLowestValueOfTheTop = 999999;
											for (l = 0; l < 100; l++)
												if (FromStartToNowGainTop100Tickers[l][1] < FromStartToNowGainLowestValueOfTheTop)
													FromStartToNowGainLowestValueOfTheTop = FromStartToNowGainTop100Tickers[l][1];
										}
									}
									else {
										FromStartToNowGainTop100Tickers.push([FromStartToNowGainTickers[n][0], InPercentage]);
										// find lowest value
										if (FromStartToNowGainTop100Tickers.length == 100) {
											FromStartToNowGainLowestValueOfTheTop = 999999
											for (let l = 0; l < 100; l++)
												if (FromStartToNowGainTop100Tickers[l][1] < FromStartToNowGainLowestValueOfTheTop)
													FromStartToNowGainLowestValueOfTheTop = FromStartToNowGainTop100Tickers[l][1];
										}
									}
								}
							}
						}
					break;
				//case 3:
					//break;
			}
			
			if (m > FromStartToNowGainPercentageProgressValue) {
				BroadcastMessage( { type: 'command', action: 'from start to now gain set percentage progress', data: Math.round((n/nn)*100) } );
				m = 0;
			}
			else
				m++;
			n++;
		}
		else {
			BroadcastMessage( { type: 'command', action: 'from start to now gain set table', data: FromStartToNowGainTop100Tickers } );
			
			if (FromStartToNowGainChangedOption) {
				BroadcastMessage( { type: 'command', action: 'from start to now gain status', data: 0 } );
				FromStartToNowGainChangedOption = false;
			}
			FromStartToNowGainTop100Tickers = [];
			n = 0;
			if (FromStartToNowGainOption == 2) {
				// set time in the past to aim for, for option 2
				TickerValueNow = await GetStockChartYahoo("AMD");
				PastTickerValueTime = TickerValueNow.timestamp[TickerValueNow.timestamp.length-1] - FromStartToNowGainCurrentMinToLookBack * 60;
			}
		}
		
		// wait some time
		await new Promise(r => setTimeout(r, FromStartToNowGainDelayValue));
	}
}

async function ProcessingTickerValueOnTable( arr // 1st array in double array, contains ticker
											 ) {
	let CurrentValue = [ "Current Value" ];
	let ChangeBeforeStart = [ "% before start" ];
	let ChangeAfterStart = [ "% after start" ];
	
	for (let a = 1, aa = arr[0].length; a < aa; a++) {
		let StockValueNow = await Get3MarketPricesYahoo(arr[0][a]); // regularMarketPrice, regularMarketPreviousClose & regularMarketOpen
		CurrentValue.push(StockValueNow[0]);
		// round the values of the array to two decimals
		ChangeBeforeStart.push;
		ChangeBeforeStart.push(Math.round(((((StockValueNow[0] > StockValueNow[1] ? StockValueNow[0] - StockValueNow[1] : StockValueNow[1] - StockValueNow[0])/StockValueNow[1])*100) + Number.EPSILON) * 100) / 100);
		// also, rounds the values two decimals also
		ChangeAfterStart.push(Math.round(((((StockValueNow[0] > StockValueNow[2] ? StockValueNow[0] - StockValueNow[2] : StockValueNow[2] - StockValueNow[0])/StockValueNow[2])*100) + Number.EPSILON) * 100) / 100);
		if (StockValueNow[0] > StockValueNow[2])
			ChangeAfterStart[a] = '+' + ChangeAfterStart[a];
		else
			ChangeAfterStart[a] = '-' + ChangeAfterStart[a];
	}
	
	//arr.push(CurrentValue, ChangeBeforeStart, ChangeAfterStart);
	arr.splice(3, 0, CurrentValue); // insert the item(array) into arr
	arr.splice(4, 0, ChangeBeforeStart);
	arr.splice(5, 0, ChangeAfterStart);
	return arr;
}

// webscraping: ====================================================================================
async function GetTradingviewInfo(GetTicker, TimeCheckFor = 0) {
	let ticker = GetTicker.toUpperCase();
	let time = [ 1, 5, 15, 30, 60, 120, 240 ][TimeCheckFor];
	
	let pageWithTradingview = -1;
	let pages = await browserInstance.pages();
	
	// look in all tabs in the browser to see if we are connected to tradingview, if not, connect to tradingview
	for (let n = 0, nn = pages.length; n < nn && pageWithTradingview == -1; n++)
		if (pages[n].mainFrame().url() == "https://www.tradingview.com/")
			pageWithTradingview = n;
		
	if (pageWithTradingview == -1) {
		// we did not find tradingview, so connect to it
		let page = await browserInstance.newPage();
		let ReturnResponse = await page.goto("https://www.tradingview.com/");
		if (ReturnResponse.url() == "https://www.tradingview.com/") {
			// look in all tabs in the browser to see if we are connected to tradingview
			pages = await browserInstance.pages();
			for (let n = 0, nn = pages.length; n < nn && pageWithTradingview == -1; n++)
				if (pages[n].mainFrame().url() == "https://www.tradingview.com/")
					pageWithTradingview = n;
			if (pageWithTradingview == -1)
				return -1; // error, could not connect to tradingview
		}
		else
			return -1; // error, could not connect to tradingview
	}
	
	// inject js code to tradingview page, to get the info we need
	async function GetTradingviewInfoData(t, m) {
		return await pages[pageWithTradingview].evaluate(async (t, m) => {
			return await new Promise(async (resolve) => {
				let returnData = [];
				let TradingviewSearchFor = "https://symbol-search.tradingview.com/symbol_search/?text=" + t;
				
				await fetch(TradingviewSearchFor, {
					"credentials": "omit",
					"method": "GET",
					"mode": "cors"
				})
				.then((response) => response.json()) // then with the data from the response in JSON...
				.then((data) => {
					if (data) {
						let tt = data[0].exchange + ':' + t;
						let body = '{"symbols":{"tickers":["' + tt + '"],"query":{"types":[]}},"columns":["Recommend.Other|' + m + '","Recommend.All|' + m + '","Recommend.MA|' + m + '"]}';
						
						fetch('https://scanner.tradingview.com/america/scan', { "body": body, "method": "POST", "mode": "cors"})
						.then((response) => response.json())
						.then((data) => {
							if (data) {
								if (data.data[0].d[0] >= 0.1) {
									if (data.data[0].d[0] >= 0.5)
										returnData.push("strong buy");
									else
										returnData.push("buy");
								}
								else if (data.data[0].d[0] <= -0.1) {
									if (data.data[0].d[0] <= -0.5)
										returnData.push("strong sell");
									else
										returnData.push("sell");
								}
								else
									returnData.push("neutral");
								if (data.data[0].d[1] >= 0.1) {
									if (data.data[0].d[1] >= 0.5)
										returnData.push("strong buy");
									else
										returnData.push("buy");
								}
								else if (data.data[0].d[1] <= -0.1) {
									if (data.data[0].d[1] <= -0.5)
										returnData.push("strong sell");
									else
										returnData.push("sell");
								}
								else
									returnData.push("neutral");
								if (data.data[0].d[2] >= 0.1) {
									if (data.data[0].d[2] >= 0.5)
										returnData.push("strong buy");
									else
										returnData.push("buy");
								}
								else if (data.data[0].d[2] <= -0.1) {
									if (data.data[0].d[2] <= -0.5)
										returnData.push("strong sell");
									else
										returnData.push("sell");
								}
								else
									returnData.push("neutral");
								
								resolve(returnData);
							}
							resolve(-1);
						})
						.catch((error) => {
							console.error('Error:', error);
							resolve(-1);
						});
					}
				})
				.catch((error) => {
					console.error('Error:', error);
					resolve(-1);
				});
			})
		}, t, m)
	}
	
	return await GetTradingviewInfoData(ticker, time);
}
async function GetTradingviewInfoSummaryNow(ticker) {
	ticker = ticker.toUpperCase();
	let pageWithTradingview = -1;
	let pages = await browserInstance.pages();
	
	// look in all tabs in the browser to see if we are connected to tradingview, if not, connect to tradingview
	for (let n = 0, nn = pages.length; n < nn && pageWithTradingview == -1; n++)
		if (pages[n].mainFrame().url() == "https://www.tradingview.com/")
			pageWithTradingview = n;
		
	if (pageWithTradingview == -1) {
		// we did not find tradingview, so connect to it
		let page = await browserInstance.newPage();
		let ReturnResponse = await page.goto("https://www.tradingview.com/");
		if (ReturnResponse.url() == "https://www.tradingview.com/") {
			// look in all tabs in the browser to see if we are connected to tradingview
			pages = await browserInstance.pages();
			for (let n = 0, nn = pages.length; n < nn && pageWithTradingview == -1; n++)
				if (pages[n].mainFrame().url() == "https://www.tradingview.com/")
					pageWithTradingview = n;
			if (pageWithTradingview == -1)
				return -1; // error, could not connect to tradingview
		}
		else
			return -1; // error, could not connect to tradingview
	}
	
	// inject js code to tradingview page, to get the info we need
	async function GetTradingviewInfoData(t) {
		return await pages[pageWithTradingview].evaluate(async (t) => {
			return await new Promise(async (resolve) => {
				let returnData = [];
				let TradingviewSearchFor = "https://symbol-search.tradingview.com/symbol_search/?text=" + t;
				
				await fetch(TradingviewSearchFor, {
					"credentials": "omit",
					"method": "GET",
					"mode": "cors"
				})
				.then((response) => response.json()) // then with the data from the response in JSON...
				.then((data) => {
					if (data) {
						t = data[0].exchange + ':' + t;
						let body = '{"symbols":{"tickers":["' + t + '"],"query":{"types":[]}},"columns":["Recommend.Other|1","Recommend.All|1"]}'; //<-- can we remove "Recommend.Other|1"!?!?!?!
						
						fetch('https://scanner.tradingview.com/america/scan', { "body": body, "method": "POST", "mode": "cors"})
						.then((response) => response.json())
						.then((data) => {
							if (data) {
								/*if (data.data[0].d[1] >= 0.1) {
									if (data.data[0].d[1] >= 0.5)
										resolve(4);
									else
										resolve(3);
								}
								else if (data.data[0].d[1] <= -0.1) {
									if (data.data[0].d[1] <= -0.5)
										resolve(1);
									else
										resolve(2);
								}
								resolve(0);*/
								resolve(data.data[0].d[1]);
							}
							resolve(-1);
						})
						.catch((error) => {
							console.error('Error:', error);
							resolve(-1);
						});
					}
				})
				.catch((error) => {
					console.error('Error:', error);
					resolve(-1);
				});
			})
		}, t)
	}
	
	return await GetTradingviewInfoData(ticker);
}

async function GetTradingviewTable(TableURL) {
	let pages = await browserInstance.pages();
	
	// look in all tabs in the browser to see if there exist a TableURL page, delete all of theme
	for (let n = pages.length-1; n > -1; n--) {
		if (pages[n].mainFrame().url() == TableURL)
			await pages[n].close();
	}
	
	// connect to TableURL and get the table data
	let page = await browserInstance.newPage();
	let ReturnResponse = await page.goto(TableURL);
	if (ReturnResponse.url() == TableURL) {
		let pageWithTableURL = -1;
		
		// find what index/tab TableURL is in
		pages = await browserInstance.pages();
		for (let n = 0, nn = pages.length; pageWithTableURL == -1 && n < nn; n++) {
			if (pages[n].mainFrame().url() == TableURL)
				pageWithTableURL = n;
		}
		
		if (pageWithTableURL != -1) {
			let ReturnValue;
			
			async function getTableInfo() {
				return await pages[pageWithTableURL].evaluate(async () => {
					return await new Promise((resolve) => {
						let ReturnArr = [];
						let a, aa;

						// 1. get all names
						ReturnArr.push(["Ticker"]);
						let matches = document.getElementsByClassName("tv-screener__symbol apply-common-tooltip");
						aa = matches.length; // get the length of the table, only 1 time
						for(a = 0; a < aa; a++)
						 ReturnArr[0].push(matches[a].textContent);
						// 2. get if they have icon
						ReturnArr.push(["Has icon?"]);
						matches = document.getElementsByClassName('tv-circle-logo tv-circle-logo--medium tv-screener-table__logo-container');
						for(a = 0; a < aa; a++)
						  ReturnArr[1].push(matches[a].tagName == "IMG" ? 'Y' : 'N');
						// 3. get special attribute
						ReturnArr.push(["special?"]);
						matches = document.getElementsByClassName('tv-screener__type');
						for(a = 0; a < aa; a++)
						  ReturnArr[2].push(matches[a].textContent);
						// 4. get full name
						ReturnArr.push(["Full name"]);
						matches = document.getElementsByClassName("tv-screener__description");
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[3].push(matches[a].textContent);
						// 5. get rating
						ReturnArr.push(["rating"]);
						matches = document.querySelectorAll('td[data-field-key="Recommend.All"]');
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[4].push(matches[a].textContent);
						// 6. get vol
						ReturnArr.push(["vol"]);
						matches = document.querySelectorAll('td[data-field-key="volume"]');
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[5].push(matches[a].textContent);
						// 7. get mkt cap
						ReturnArr.push(["mkt cap"]);
						matches = document.querySelectorAll('td[data-field-key="market_cap_basic"]');
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[6].push(matches[a].textContent);
						// 8. get P/E
						ReturnArr.push(["P/E"]);
						matches = document.querySelectorAll('td[data-field-key="price_earnings_ttm"]');
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[7].push(matches[a].textContent);
						// 9. get EPS(TTM)
						ReturnArr.push(["EPS(TTM)"]);
						matches = document.querySelectorAll('td[data-field-key="earnings_per_share_basic_ttm"]');
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[8].push(matches[a].textContent);
						// 10. get EMPLOYEES
						ReturnArr.push(["EMPLOYEES"]);
						matches = document.querySelectorAll('td[data-field-key="number_of_employees"]');
						for(a = 0, aa = matches.length; a < aa; a++)
						  ReturnArr[9].push(matches[a].textContent);
						// 11. get SECTOR
						ReturnArr.push(["SECTOR"]);
						matches = document.getElementsByClassName('tv-screener__symbol--secondary');
						for(a = 0, aa = matches.length; a < aa; a++)
							ReturnArr[10].push(matches[a].textContent);
						
						resolve(ReturnArr);
					})
				})
			}
			
			ReturnValue = await getTableInfo();
			//pages[pageWithTableURL].close();
			return ReturnValue;
		}
	}
	console.log("ERROR! can not connect to tradingview! " + TableURL);
	return -1;
}


async function GetCookies() {
	let data = await global_page._client.send('Network.getAllCookies');
	console.log("data:");
	console.log(data);
}
async function GetStockInfoYahoo(str) {
	let page = await browserInstance.newPage();
	global_page = page;
	console.log(`Navigating to ${str}...`);
	let ReturnResponse = await page.goto(str);
	
	// if this is the 1st time going to Yahoo we need to accapt cookie policy.
	if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) {
		await page.evaluate(() => {
			let buttons = document.getElementsByTagName('button');
			buttons[0].click();
		});
	}
}

async function GetStockChartYahoo(ticker, date = 0) { //https://finance.yahoo.com/quote/AMD // must call this function like this(!): await GetStockChartYahoo()
	let dateOptions = [ "2m&useYfid=true&range=1d", "15m&useYfid=true&range=5d",
						"1h&useYfid=true&range=1mo", "1d&useYfid=true&range=6mo",
						"1h&useYfid=true&range=ytd", "1wk&useYfid=true&range=1y",
						"1mo&useYfid=true&range=5y", "1mo&useYfid=true&range=max" ];
	let t = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker +
			"?region=US&lang=en-US&includePrePost=false&interval=" +
			dateOptions[date] + "&corsDomain=finance.yahoo.com&.tsrc=finance";
	let pageWithYahoo = -1;
	let pages = await browserInstance.pages();

	// look in all tabs in the browser to see if there exist a finance.yahoo page. If there exist one, use that one to inject js code to get the info we need.
	for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
		if (pages[n].url().includes("https://finance.yahoo.com"))
			pageWithYahoo = n;
	}
	
	if (pageWithYahoo == -1) {
		// no tab could be found with yahoo, connect to yahoo and get the stock value
		let page = await browserInstance.newPage();
		console.log("Navigating to https://finance.yahoo.com...");
		let ReturnResponse = await page.goto("https://finance.yahoo.com");

		if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) { // if this is the 1st time going to Yahoo we need to accapt cookie policy.
			await page.evaluate(() => {
				let buttons = document.getElementsByTagName('button');
				buttons[0].click();
			});
			
			return await new Promise((resolve) => {
				page.on('response', async function handler(response) {
					const status = response.status()
					if ((status >= 300) && (status <= 399)) {
						pageWithYahoo = -1;
						pages = await browserInstance.pages();
						for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
							if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
								pageWithYahoo = n;
						}
						if (pageWithYahoo != -1) {
							let ReturnValue;

							async function getStockChartInfo(t) {
								return await pages[pageWithYahoo].evaluate(async (t) => {
									return await new Promise((resolve) => {
										let xhttp = new XMLHttpRequest();
										xhttp.onreadystatechange = function() {
											if (this.status == 404)
												resolve(-1);
											else if (this.readyState == 4 && this.status == 200) {
												resolve(xhttp.responseText);
											}
										};
										xhttp.open("GET", t, true);
										xhttp.send();
									})
								}, t)
							}
							
							ReturnValue = await getStockChartInfo(t);
							page.off('response', handler);
							if (ReturnValue == -1)
								resolve(-1);
							resolve(JSON.parse(ReturnValue).chart.result[0]);
						}
					}
					//else
						//console.log("ERROR! can not connect to yahoo!");
				});
			});
		}
		if (ReturnResponse._url.includes("https://finance.yahoo.com/")) {
			pageWithYahoo = -1;
			
			pages = await browserInstance.pages();
			for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
				if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
					pageWithYahoo = n;
			}
			
			if (pageWithYahoo != -1) {
				let ReturnValue;
				
				async function getStockChartInfo(t) {
					return await pages[pageWithYahoo].evaluate(async (t) => {
						return await new Promise((resolve) => {
							let xhttp = new XMLHttpRequest();
							xhttp.onreadystatechange = function() {
								if (this.status == 404)
									resolve(-1);
								else if (this.readyState == 4 && this.status == 200) {
									resolve(xhttp.responseText);
								}
							};
							xhttp.open("GET", t, true);
							xhttp.send();
						})
					}, t)
				}
				
				ReturnValue = await getStockChartInfo(t);
				if (ReturnValue == -1)
					return -1;
				return JSON.parse(ReturnValue).chart.result[0];
			}
		}
		console.log("ERROR! can not connect to yahoo!");
		return -1;
	}
	// could found tab connected to yahoo, use that tab and get the stock value, by injecting to that tab js code that will return the values we need
	let ReturnValue;

	async function getStockChartInfo(t) { // injects js code to yahoo tab, and get the value, return that value to this function, which then returns that
		return await pages[pageWithYahoo].evaluate(async (t) => {
			return await new Promise((resolve) => {
				let xhttp = new XMLHttpRequest();
				xhttp.onreadystatechange = function() {
					if (this.status == 404)
						resolve(-1);
					else if (this.readyState == 4 && this.status == 200) {
						resolve(xhttp.responseText);
					}
				};
				xhttp.open("GET", t, true);
				xhttp.send();
			})
		}, t)
	}
	
	ReturnValue = await getStockChartInfo(t);
	if (ReturnValue == -1)
		return -1;
	return JSON.parse(ReturnValue).chart.result[0];
}
async function GetRegularMarketPriceYahoo(ticker) { // call this function like this: console.log(await GetRegularMarketPriceYahoo("AMD"));
	let pageWithYahoo = -1;
	let pages = await browserInstance.pages();
	
	for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
		if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
			pageWithYahoo = n;
	}
	
	if (pageWithYahoo == -1) {
		let page = await browserInstance.newPage();
		let ReturnResponse = await page.goto("https://finance.yahoo.com");

		if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) {
			await page.evaluate(() => {
				let buttons = document.getElementsByTagName('button');
				buttons[0].click();
			});
			
			return await new Promise((resolve) => {
				page.on('response', async function handler(response) {
					const status = response.status()
					if ((status >= 300) && (status <= 399)) {
						pageWithYahoo = -1;
						pages = await browserInstance.pages();
						for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
							if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
								pageWithYahoo = n;
						}
						if (pageWithYahoo != -1) {
							async function getStockValueNow(t) {
								return await pages[pageWithYahoo].evaluate(async (t) => {
									return await new Promise((resolve) => {
										let xhttp = new XMLHttpRequest();
										xhttp.onreadystatechange = function() {
											if (this.readyState == 4 && this.status == 200) {
												let ReturnNumber = '';
												let r = xhttp.responseText.search("regularMarketPrice");
												for (r += 20; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
													ReturnNumber += xhttp.responseText[r];
												resolve(+ReturnNumber);
											}
										};
										xhttp.open("GET", "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + t + "&fields=regularMarketPrice", true);
										xhttp.send();
									})
								}, t)
							}
							
							page.off('response', handler);
							resolve(await getStockValueNow(ticker));
						}
					}
					//else
						//console.log("ERROR! can not connect to yahoo!");
				});
			});
		}
		if (ReturnResponse._url.includes("https://finance.yahoo.com/")) {
			pageWithYahoo = -1;
			
			pages = await browserInstance.pages();
			for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
				if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
					pageWithYahoo = n;
			}
			
			if (pageWithYahoo != -1) {
				async function getStockValueNow(t) {
					return await pages[pageWithYahoo].evaluate(async (t) => {
						return await new Promise((resolve) => {
							let xhttp = new XMLHttpRequest();
							xhttp.onreadystatechange = function() {
								if (this.readyState == 4 && this.status == 200) {
									let ReturnNumber = '';
									let r = xhttp.responseText.search("regularMarketPrice");
									for (r += 20; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
										ReturnNumber += xhttp.responseText[r];
									resolve(+ReturnNumber);
								}
							};
							xhttp.open("GET", "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + t + "&fields=regularMarketPrice", true);
							xhttp.send();
						})
					}, t)
				}
				
				return await getStockValueNow(ticker);
			}
		}
		console.log("ERROR! can not connect to yahoo!");
		return -1;
	}
	async function getStockValueNow(t) {
		return await pages[pageWithYahoo].evaluate(async (t) => {
			return await new Promise((resolve) => {
				let xhttp = new XMLHttpRequest();
				xhttp.onreadystatechange = function() {
					if (this.readyState == 4 && this.status == 200) {
						let ReturnNumber = '';
						let r = xhttp.responseText.search("regularMarketPrice");
						for (r += 20; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
							ReturnNumber += xhttp.responseText[r];
						resolve(+ReturnNumber);
					}
				};
				xhttp.open("GET", "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + t + "&fields=regularMarketPrice", true);
				xhttp.send();
			})
		}, t)
	}
	
	return await getStockValueNow(ticker)
}
async function GetRegularMarketOpenYahoo(ticker) {
	let pageWithYahoo = -1;
	let pages = await browserInstance.pages();
	
	for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
		if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
			pageWithYahoo = n;
	}
	
	if (pageWithYahoo == -1) {
		let page = await browserInstance.newPage();
		//console.log("Navigating to https://finance.yahoo.com...");
		let ReturnResponse = await page.goto("https://finance.yahoo.com");

		if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) {
			await page.evaluate(() => {
				let buttons = document.getElementsByTagName('button');
				buttons[0].click();
			});
			
			return await new Promise((resolve) => {
				page.on('response', async function handler(response) {
					const status = response.status()
					if ((status >= 300) && (status <= 399)) {
						pageWithYahoo = -1;
						pages = await browserInstance.pages();
						for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
							if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
								pageWithYahoo = n;
						}
						if (pageWithYahoo != -1) {
							async function getStockValueNow(t) {
								return await pages[pageWithYahoo].evaluate(async (t) => {
									return await new Promise((resolve) => {
										let xhttp = new XMLHttpRequest();
										xhttp.onreadystatechange = function() {
											if (this.readyState == 4 && this.status == 200) {
												let ReturnNumber = '';
												let r = xhttp.responseText.search("regularMarketOpen");
												for (r += 19; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
													ReturnNumber += xhttp.responseText[r];
												resolve(+ReturnNumber);
											}
										};
										xhttp.open("GET", "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + t + "&fields=regularMarketOpen", true);
										xhttp.send();
									})
								}, t)
							}
							
							page.off('response', handler);
							resolve(await getStockValueNow(ticker));
						}
					}
					//else
						//console.log("ERROR! can not connect to yahoo!");
				});
			});
		}
		if (ReturnResponse._url.includes("https://finance.yahoo.com/")) {
			pageWithYahoo = -1;
			
			pages = await browserInstance.pages();
			for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
				if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
					pageWithYahoo = n;
			}
			
			if (pageWithYahoo != -1) {
				async function getStockValueNow(t) {
					return await pages[pageWithYahoo].evaluate(async (t) => {
						return await new Promise((resolve) => {
							let xhttp = new XMLHttpRequest();
							xhttp.onreadystatechange = function() {
								if (this.readyState == 4 && this.status == 200) {
									let ReturnNumber = '';
									let r = xhttp.responseText.search("regularMarketOpen");
									for (r += 19; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
										ReturnNumber += xhttp.responseText[r];
									resolve(+ReturnNumber);
								}
							};
							xhttp.open("GET", "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + t + "&fields=regularMarketOpen", true);
							xhttp.send();
						})
					}, t)
				}
				
				return await getStockValueNow(ticker);
			}
		}
		console.log("ERROR! can not connect to yahoo!");
		return -1;
	}
	async function getStockValueNow(t) {
		return await pages[pageWithYahoo].evaluate(async (t) => {
			return await new Promise((resolve) => {
				let xhttp = new XMLHttpRequest();
				xhttp.onreadystatechange = function() {
					if (this.readyState == 4 && this.status == 200) {
						let ReturnNumber = '';
						let r = xhttp.responseText.search("regularMarketOpen");
						for (r += 19; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
							ReturnNumber += xhttp.responseText[r];
						resolve(+ReturnNumber);
					}
				};
				xhttp.open("GET", "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + t + "&fields=regularMarketOpen", true);
				xhttp.send();
			})
		}, t)
	}
	
	return await getStockValueNow(ticker)
}
async function Get3MarketPricesYahoo(ticker) { // get regularMarketPrice, regularMarketPreviousClose & regularMarketOpen
	let t = "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + ticker;
	let pageWithYahoo = -1;
	let pages = await browserInstance.pages();
	
	for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
		if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
			pageWithYahoo = n;
	}
	
	if (pageWithYahoo == -1) {
		let page = await browserInstance.newPage();
		//console.log("Navigating to https://finance.yahoo.com...");
		let ReturnResponse = await page.goto("https://finance.yahoo.com");

		if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) {
			await page.evaluate(() => {
				let buttons = document.getElementsByTagName('button');
				buttons[0].click();
			});
			
			return await new Promise((resolve) => {
				page.on('response', async function handler(response) {
					const status = response.status()
					if ((status >= 300) && (status <= 399)) {
						pageWithYahoo = -1;
						pages = await browserInstance.pages();
						for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
							if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
								pageWithYahoo = n;
						}
						if (pageWithYahoo != -1) {
							let ReturnValue;

							async function getStockValueNow(t) {
								return await pages[pageWithYahoo].evaluate(async (t) => {
									return await new Promise((resolve) => {
										let xhttp = new XMLHttpRequest();
										xhttp.onreadystatechange = function() {
											if (this.readyState == 4 && this.status == 200) {
												let ReturnArr = [];
												let ReturnNumber = '';
												
												// get regularMarketPrice
												let r = xhttp.responseText.search("regularMarketPrice");
												for (r += 20; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
													ReturnNumber += xhttp.responseText[r];
												ReturnArr.push(+ReturnNumber);
												// get regularMarketPreviousClose
												ReturnNumber = '';
												r = xhttp.responseText.search("regularMarketPreviousClose");
												for (r += 28; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
													ReturnNumber += xhttp.responseText[r];
												ReturnArr.push(+ReturnNumber);
												// get regularMarketOpen
												ReturnNumber = '';
												r = xhttp.responseText.search("regularMarketOpen");
												for (r += 19; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
													ReturnNumber += xhttp.responseText[r];
												ReturnArr.push(+ReturnNumber);
												
												resolve(ReturnArr);
											}
										};
										xhttp.open("GET", t, true);
										xhttp.send();
									})
								}, t)
							}
							
							ReturnValue = await getStockValueNow(t);
							page.off('response', handler);
							resolve(ReturnValue);
						}
					}
					//else
						//console.log("ERROR! can not connect to yahoo!");
				});
			});
		}
		if (ReturnResponse._url.includes("https://finance.yahoo.com/")) {
			pageWithYahoo = -1;
			
			pages = await browserInstance.pages();
			for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
				if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
					pageWithYahoo = n;
			}
			
			if (pageWithYahoo != -1) {
				let ReturnValue;
				
				async function getStockValueNow(t) {
					return await pages[pageWithYahoo].evaluate(async (t) => {
						return await new Promise((resolve) => {
							let xhttp = new XMLHttpRequest();
							xhttp.onreadystatechange = function() {
								if (this.readyState == 4 && this.status == 200) {
									let ReturnArr = [];
									let ReturnNumber = '';
									
									// get regularMarketPrice
									let r = xhttp.responseText.search("regularMarketPrice");
									for (r += 20; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
										ReturnNumber += xhttp.responseText[r];
									ReturnArr.push(+ReturnNumber);
									// get regularMarketPreviousClose
									ReturnNumber = '';
									r = xhttp.responseText.search("regularMarketPreviousClose");
									for (r += 28; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
										ReturnNumber += xhttp.responseText[r];
									ReturnArr.push(+ReturnNumber);
									// get regularMarketOpen
									ReturnNumber = '';
									r = xhttp.responseText.search("regularMarketOpen");
									for (r += 19; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
										ReturnNumber += xhttp.responseText[r];
									ReturnArr.push(+ReturnNumber);
									
									resolve(ReturnArr);
								}
							};
							xhttp.open("GET", t, true);
							xhttp.send();
						})
					}, t)
				}
				
				ReturnValue = await getStockValueNow(t);
				return ReturnValue;
			}
		}
		console.log("ERROR! can not connect to yahoo!");
		return -1;
	}
	let ReturnValue;
	
	async function getStockValueNow(t) {
		return await pages[pageWithYahoo].evaluate(async (t) => {
			return await new Promise((resolve) => {
				let xhttp = new XMLHttpRequest();
				xhttp.onreadystatechange = function() {
					if (this.readyState == 4 && this.status == 200) {
						let ReturnArr = [];
						let ReturnNumber = '';
						
						// get regularMarketPrice
						let r = xhttp.responseText.search("regularMarketPrice");
						for (r += 20; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
							ReturnNumber += xhttp.responseText[r];
						ReturnArr.push(+ReturnNumber);
						// get regularMarketPreviousClose
						ReturnNumber = '';
						r = xhttp.responseText.search("regularMarketPreviousClose");
						for (r += 28; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
							ReturnNumber += xhttp.responseText[r];
						ReturnArr.push(+ReturnNumber);
						// get regularMarketOpen
						ReturnNumber = '';
						r = xhttp.responseText.search("regularMarketOpen");
						for (r += 19; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
							ReturnNumber += xhttp.responseText[r];
						ReturnArr.push(+ReturnNumber);
						
						resolve(ReturnArr);
					}
				};
				xhttp.open("GET", t, true);
				xhttp.send();
			})
		}, t)
	}
	
	ReturnValue = await getStockValueNow(t);
	return ReturnValue
}
async function GetStockPreMarketValueYahoo(ticker) {
	let t = "https://query1.finance.yahoo.com/v7/finance/quote?=&symbols=" + ticker + "&fields=preMarketPrice";
	let pageWithYahoo = -1;
	let pages = await browserInstance.pages();
	
	for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
		if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
			pageWithYahoo = n;
	}
	
	if (pageWithYahoo == -1) {
		// connect to yahoo and get the stock value
		let page = await browserInstance.newPage();
		console.log("Navigating to https://finance.yahoo.com...");
		let ReturnResponse = await page.goto("https://finance.yahoo.com");

		if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) {
			await page.evaluate(() => {
				let buttons = document.getElementsByTagName('button');
				buttons[0].click();
			});
			
			return await new Promise((resolve) => {
				page.on('response', async function handler(response) {
					const status = response.status()
					if ((status >= 300) && (status <= 399)) {
						pageWithYahoo = -1;
						pages = await browserInstance.pages();
						for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
							if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
								pageWithYahoo = n;
						}
						if (pageWithYahoo != -1) {
							console.log("WE ARE CONNECTED TO YAHOO!!!!");
							let ReturnValue;

							async function getStockPreMarketValue(t) {
								return await pages[pageWithYahoo].evaluate(async (t) => {
									return await new Promise((resolve) => {
										let xhttp = new XMLHttpRequest();
										xhttp.onreadystatechange = function() {
											if (this.readyState == 4 && this.status == 200) {
												let ReturnNumber = '';
												let r = xhttp.responseText.search("preMarketPrice");
												for (r += 16; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
													ReturnNumber += xhttp.responseText[r];
												resolve(+ReturnNumber);
											}
										};
										xhttp.open("GET", t, true);
										xhttp.send();
									})
								}, t)
							}
							
							ReturnValue = await getStockPreMarketValue(t);
							page.off('response', handler);
							resolve(ReturnValue);
						}
					}
					//else
						//console.log("ERROR! can not connect to yahoo!");
				});
			});
		}
		if (ReturnResponse._url.includes("https://finance.yahoo.com/")) {
			pageWithYahoo = -1;
			
			pages = await browserInstance.pages();
			for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
				if (pages[n]._frameManager._mainFrame._url.includes("https://finance.yahoo.com"))
					pageWithYahoo = n;
			}
			
			if (pageWithYahoo != -1) {
				console.log("WE ARE CONNECTED TO YAHOO!!!!");
				let ReturnValue;
				
				async function getStockPreMarketValue(t) {
					return await pages[pageWithYahoo].evaluate(async (t) => {
						return await new Promise((resolve) => {
							let xhttp = new XMLHttpRequest();
							xhttp.onreadystatechange = function() {
								if (this.readyState == 4 && this.status == 200) {
									let ReturnNumber = '';
									let r = xhttp.responseText.search("preMarketPrice");
									for (r += 16; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
										ReturnNumber += xhttp.responseText[r];
									resolve(+ReturnNumber);
								}
							};
							xhttp.open("GET", t, true);
							xhttp.send();
						})
					}, t)
				}
				
				ReturnValue = await getStockPreMarketValue(t);
				return ReturnValue;
			}
		}
		console.log("ERROR! can not connect to yahoo!");
		return -1;
	}
	let ReturnValue;
	
	async function getStockPreMarketValue(t) {
		return await pages[pageWithYahoo].evaluate(async (t) => {
			return await new Promise((resolve) => {
				let xhttp = new XMLHttpRequest();
				xhttp.onreadystatechange = function() {
					if (this.readyState == 4 && this.status == 200) {
						let ReturnNumber = '';
						let r = xhttp.responseText.search("preMarketPrice");
						for (r += 16; xhttp.responseText[r] != ',' && xhttp.responseText[r] != '}'; r++)
							ReturnNumber += xhttp.responseText[r];
						resolve(+ReturnNumber);
					}
				};
				xhttp.open("GET", t, true);
				xhttp.send();
			})
		}, t)
	}
	
	ReturnValue = await getStockPreMarketValue(t);
	return ReturnValue
}


async function YahooConnectToURL(url) {
	let page = await browserInstance.newPage();
	console.log("Navigating to " + url);
	let ReturnResponse = await page.goto(url);

	if (ReturnResponse._url.includes("https://consent.yahoo.com/v2/collectConsent?sessionId=")) {
		await page.evaluate(() => {
			let buttons = document.getElementsByTagName('button');
			buttons[0].click();
		});
		
		return await new Promise((resolve) => {
			page.on('response', async function handler(response) {
				const status = response.status()
				if ((status >= 300) && (status <= 399)) {
					let pageWithYahooURL = -1;
					pages = await browserInstance.pages();
					for (let n = 0, m = pages.length; pageWithYahooURL == -1 && n < m; n++) {
						if (pages[n]._frameManager._mainFrame._url.includes(url))
							pageWithYahooURL = n;
					}
					if (pageWithYahooURL != -1) {
						console.log("WE ARE CONNECTED TO YAHOO!!!!");
						page.off('response', handler);
						resolve(pageWithYahooURL);
					}
				}
				//else
					//console.log("ERROR! can not connect to yahoo!");
			});
		});
	}
	if (ReturnResponse._url.includes(url)) {
		let pageWithYahooURL = -1;
		
		pages = await browserInstance.pages();
		for (let n = 0, m = pages.length; pageWithYahooURL == -1 && n < m; n++) {
			if (pages[n]._frameManager._mainFrame._url.includes(url))
				pageWithYahooURL = n;
		}
		
		if (pageWithYahooURL != -1) {
			return pageWithYahooURL;
		}
	}
	console.log("ERROR! can not connect to yahoo!");
	return -1;
}
async function GetStockInfoYahoo(ticker) { // console.log(await GetStockInfoYahoo("AMD"));
	// 1. search troguht the tabs to check if we are connected to the ticker, if not -connect to that ticker/website
	let t = "https://finance.yahoo.com/quote/" + ticker;
	let YahooPageWithTicker = -1;
	let pages = await browserInstance.pages();
	
	for (let n = 0, m = pages.length; YahooPageWithTicker == -1 && n < m; n++) {
		if (pages[n]._frameManager._mainFrame._url.includes(t))
			YahooPageWithTicker = n;
	}
	
	if (YahooPageWithTicker == -1) { //<------------------------------------------------------------------THIS NEEDS TO BE TESTED!!!
			if ((YahooPageWithTicker = await YahooConnectToURL(t)) == -1) {
			// we failed connecting to yahoo with the specified "ticker"
			return -1;
		}
		
		pages = await browserInstance.pages();
	}
	
	let URLPageSource = await pages[YahooPageWithTicker].content(); // get the HTML source from the Yahoo ticker page
	
	// 2. get data of the ticker and make a object which will be returned
	// get earningsChart data
	let r = URLPageSource.indexOf("earningsChart");
	r += 15;
	if (URLPageSource[r] != '{') {
		r = URLPageSource.indexOf("earningsChart", r);
		r += 15;
		if (URLPageSource[r] != '{') {
			console.log("ERROR! could not find earningsChart");
			return {};
		}
	}
	let earningsChart = '{';
	let LeftCurlyBrackets = 1;
	while (LeftCurlyBrackets) {
		r++
		earningsChart += URLPageSource[r];
		if (URLPageSource[r] == '{')
			++LeftCurlyBrackets;
		if (URLPageSource[r] == '}')
			--LeftCurlyBrackets;
	}
	earningsChart = JSON.parse(earningsChart);
	
	// get financialsChart data
	r = URLPageSource.indexOf("financialsChart");
	r += 17;
	if (URLPageSource[r] != '{') {
		r = URLPageSource.indexOf("financialsChart", r);
		r += 17;
		if (URLPageSource[r] != '{') {
			console.log("ERROR! could not find financialsChart");
			return {};
		}
	}
	let financialsChart = '{';
	LeftCurlyBrackets = 1;
	while (LeftCurlyBrackets) {
		r++
		financialsChart += URLPageSource[r];
		if (URLPageSource[r] == '{')
			++LeftCurlyBrackets;
		if (URLPageSource[r] == '}')
			--LeftCurlyBrackets;
	}
	financialsChart = JSON.parse(financialsChart);
	
	// get recommendationTrend data
	r = URLPageSource.indexOf("recommendationTrend");
	r += 21;
	if (URLPageSource[r] != '{') {
		console.log("ERROR! could not find recommendationTrend");
		return {};
	}
	let recommendationTrend = '{';
	LeftCurlyBrackets = 1;
	while (LeftCurlyBrackets) {
		r++
		recommendationTrend += URLPageSource[r];
		if (URLPageSource[r] == '{')
			++LeftCurlyBrackets;
		if (URLPageSource[r] == '}')
			--LeftCurlyBrackets;
	}
	recommendationTrend = JSON.parse(recommendationTrend);
	
	// get financialData data, recommendationMean(Recommendation Rating), targetMeanPrice/targetLowPrice/targetHighPrice(Analyst Price Targets)
	r = URLPageSource.indexOf("financialData");
	r += 15;
	if (URLPageSource[r] != '{') {
		console.log("ERROR! could not find financialData");
		return {};
	}
	let financialData = '{';
	LeftCurlyBrackets = 1;
	while (LeftCurlyBrackets) {
		r++
		financialData += URLPageSource[r];
		if (URLPageSource[r] == '{')
			++LeftCurlyBrackets;
		if (URLPageSource[r] == '}')
			--LeftCurlyBrackets;
	}
	financialData = JSON.parse(financialData);
	
	// get upgradeDowngradeHistory(Upgrades & Downgrades) data
	r = URLPageSource.indexOf("upgradeDowngradeHistory");
	r += 25;
	if (URLPageSource[r] != '{') {
		r = URLPageSource.indexOf("upgradeDowngradeHistory", r);
		r += 25;
		if (URLPageSource[r] != '{') {
			r += 25;
			r = URLPageSource.indexOf("upgradeDowngradeHistory", r);
			if (URLPageSource[r] != '{') {
				console.log("ERROR! could not find upgradeDowngradeHistory");
				return {};
			}
		}
	}
	let upgradeDowngradeHistory = '{';
	LeftCurlyBrackets = 1;
	while (LeftCurlyBrackets) {
		r++
		upgradeDowngradeHistory += URLPageSource[r];
		if (URLPageSource[r] == '{')
			++LeftCurlyBrackets;
		if (URLPageSource[r] == '}')
			--LeftCurlyBrackets;
	}
	upgradeDowngradeHistory = JSON.parse(upgradeDowngradeHistory);
	
	// get summaryProfile data
	r = URLPageSource.indexOf("summaryProfile");
	r += 16;
	if (URLPageSource[r] != '{') {
		console.log("ERROR! could not find summaryProfile");
		return {};
	}
	let summaryProfile = '{';
	LeftCurlyBrackets = 1;
	while (LeftCurlyBrackets) {
		r++
		summaryProfile += URLPageSource[r];
		if (URLPageSource[r] == '{')
			++LeftCurlyBrackets;
		if (URLPageSource[r] == '}')
			--LeftCurlyBrackets;
	}
	summaryProfile = JSON.parse(summaryProfile);
	
	let TickerInfo = {
		earningsChart : earningsChart,
		financialsChart : financialsChart,
		recommendationTrend : recommendationTrend,
		financialData : financialData, // recommendationMean(Recommendation Rating), targetMeanPrice/targetLowPrice/targetHighPrice(Analyst Price Targets)
		upgradeDowngradeHistory : upgradeDowngradeHistory, // (Upgrades & Downgrades)
		summaryProfile : summaryProfile
	};
	return TickerInfo;
}
async function YahooGetNASDAQTradingHours() {
	// 1. search troguht the tabs to check if we are connected to Yahoo, if not -connect to Yahoo, connect to it
	let t = "https://finance.yahoo.com/";
	let pageWithYahoo = -1;
	let pages = await browserInstance.pages();
	
	for (let n = 0, m = pages.length; pageWithYahoo == -1 && n < m; n++) {
		if (pages[n]._frameManager._mainFrame._url.includes(t))
			pageWithYahoo = n;
	}
	
	if (pageWithYahoo == -1) {
		if ((pageWithYahoo = await YahooConnectToURL(t)) == -1) {
			// we failed connecting to yahoo with the specified "ticker"
			return -1;
		}
		
		pages = await browserInstance.pages();
	}
	
	let URLPageSource = await pages[pageWithYahoo].content(); // get the HTML source from the Yahoo ticker page
	
	// 2. get markets open/close data(we are looking for the id: mk-msg
	let MarketMessage = '';
	
	let r = URLPageSource.indexOf("mk-msg");
	while (URLPageSource[r] != '>') r++;
	r++;
	while (URLPageSource[r] != '<') {
		MarketMessage += URLPageSource[r];
		r++;
	}
	return MarketMessage;
}
function ParseYahooNASDAQTradingHoursMessage(msg) {
	let returnValue = 0;
	switch (msg) {
		case "U.S. markets closed":
			returnValue = -1;
			break;
		default:
			break;
	}
	return returnValue;
}
async function GetTradinghoursTradingHours() {
	
}
async function GetNASDAQStockExchangeHolidays() {
	
}
async function GetAvanzaOpenHours() {
	
}


function ConnectingToMySQL() {
	connection = mysql.createConnection({
		host: 'localhost',
		user: 'root',
		password: 'root',
		database: 'nasdaqusa'
	});
	
	connection.connect(function(err) {
		if (err) {
			return console.error('error: ' + err.message);
		}

		AreWeConnectedToNasdaqusa = true;
		console.log('Connected to the MySQL server.');
	});
}
function DisconnectToMySQL() {
	connection.end(function(err) {
		if (err) {
			return console.log('error:' + err.message);
		}
		
		AreWeConnectedToNasdaqusa = false;
		console.log('Closed the database connection.');
	});
	//connection.destroy(); //force the connection to close immediately
}
/*function InsertToMyMySQL() {
	let InsertStatment = "INSERT INTO \`nasdaqusa\`.\`stocks\` (\`Ticker symbol\`, \`Common Stock\`, \`Security Name\`) \
						  VALUES ('AMD', true, 'Advance Micro Processing');";

	connection.query(InsertStatment);
}*/
function InsertToMyMySQL() {
	if (!AreWeConnectedToNasdaqusa)
		return;
	
	let InsertStatment = "INSERT INTO \`nasdaqusa\`.\`stocks\` (\`Ticker symbol\`, \`Common Stock\`, \`Security Name\`) \
						  VALUES ?;";
	let arrValues = [ ['AMD', true, 'Advance Micro Prossesors'],
					  ['Nvidia', true, 'Jensens Co.'] ];

	connection.query(InsertStatment, [arrValues], (err, results, fields) => {
		if (err) {
			return console.log(err.message);
		}
		
		// get inserted rows
		console.log('Row inserted:' + results.affectedRows);
	});
}
function GetDataFromMySQL() {
	if (!AreWeConnectedToNasdaqusa)
		return;
	
	let getdatastring = `SELECT * FROM nasdaqusa.stocks;`;
	connection.query(getdatastring, (error, results, fields) => {
		if (error) {
			return console.log(error.message);
		}
		console.log(results);
	});
}

function UpdateNasdaqStockList() {
	let c = new FtpClient();
	
	c.on('ready', function() {
		c.cwd("/SymbolDirectory/", (err, currentDir) => {
			if (err) throw err;
			c.get('nasdaqlisted.txt', function(err, stream) {
				if (err) throw err;
				stream.once('close', function() {
					console.log("has finnished downloading \"nasdaqlisted.txt\".");
					c.get('otherlisted.txt', function(err, stream) {
						if (err) throw err;
						stream.once('close', function() {
							console.log("has finnished downloading \"otherlisted.txt\".");
							c.end();
							
							// compare nasdaqlisted-copy.txt with what is on the MySQL database
							let StocksOfTextFile = [];
							let StocksOfDataBase = [];
							let TodaysDate = 0;
							const readInterface0 = readline.createInterface({
								input: fs.createReadStream('nasdaqlisted-copy.txt'),
								console: false
							});
							
							readInterface0.on('line', function(line) {
								line = line.split('|');
								if (!(line[0].includes("File Creation Time")))
									if (!(line[0].includes("Symbol"))) {
										StocksOfTextFile.push([line[0], line[1].includes("Common Stock") ? 1 : 0, line[1]]); //<------- remove slice!!!
									}
							});
							readInterface0.on('close', function () {
								// compare otherlisted-copy.txt with what is on the MySQL database
								const readInterface1 = readline.createInterface({
									input: fs.createReadStream('otherlisted-copy.txt'),
									console: false
								});

								readInterface1.on('line', function(line) {
									line = line.split('|');
									if (!(line[0].includes("File Creation Time")))
										if (!(line[0].includes("Symbol"))) {
											StocksOfTextFile.push([line[0], line[1].includes("Common Stock") ? 1 : 0, line[1]]); //<------- remove slice!!!
										}
									});

								readInterface1.on('close', function () {
									let _InteractionWithMySQL = function() {
										function _checkForErrors(error, rows) {
											if (error) {
												this.emit('error', error);
												return true;
											}

											return false;
										}
										
										function _LogRemovedStocks(error, results) {
											if (_checkForErrors(error))
												return false;
											
											console.log('Row inserted:' + results.affectedRows); // display inserted rows
										}
										function _RemoveStocks(error, results) {
											if (_checkForErrors(error))
												return false;
											
											console.log('Deleted Row(s):', results.affectedRows);
											
											if (TodaysDate == 0) {
												// set Todaysdate
												const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
												let datetime = new Date();
												
												TodaysDate = weekday[datetime.getDay()] + " " + datetime.getFullYear() + "-" +
															 (datetime.getMonth() + 1) + "-" + datetime.getDate() + " " + datetime.getHours() +
															 ":" + datetime.getMinutes() + ":" + datetime.getSeconds();
											}
											
											for (let n = 0, m = StocksOfDataBase.length; n < m; n++)
												StocksOfDataBase[n].unshift("Deleted this stock, because it was no longer in the Nasdaq text files", TodaysDate);
											
											let InsertStatment = "INSERT INTO nasdaqusa.\`stock change\`(\`What happened\`, Date, \
													  \`Ticker symbol\`, \`Common Stock\`, \`Security Name\`, \`Industry Group\`, Industry, \
													  \`Sub-Industry\`) VALUES ?";
											connection.query(InsertStatment, [StocksOfDataBase], _LogRemovedStocks);
										}
										
										function _LogAddedStocks(error, results) {
											if (_checkForErrors(error))
												return false;
											
											console.log('Row inserted:' + results.affectedRows); // display inserted rows
										}
										function _AddStocks(error, results) {
											if (_checkForErrors(error)) {
												return false;
											}

											console.log('Row inserted:' + results.affectedRows); // display inserted rows
											
											// set Todaysdate
											const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
											let datetime = new Date();
											
											TodaysDate = weekday[datetime.getDay()] + " " + datetime.getFullYear() + "-" +
														 (datetime.getMonth() + 1) + "-" + datetime.getDate() + " " + datetime.getHours() +
														 ":" + datetime.getMinutes() + ":" + datetime.getSeconds();
											
											for (let n = 0, m = StocksOfTextFile.length; n < m; n++)
												StocksOfTextFile[n].unshift("Added this stock, new stock from the Nasdaq text files", TodaysDate);
											
											let InsertStatment = "INSERT INTO nasdaqusa.\`stock change\`(\`What happened\`, Date, \
													  \`Ticker symbol\`, \`Common Stock\`, \`Security Name\`) VALUES ?";
											connection.query(InsertStatment, [StocksOfTextFile], _LogAddedStocks);
										}
										
										function _ProccessRecivedData(error, results) {
											if (_checkForErrors(error))
												return false;
											// compare "results" with "StocksOfTextFile" to see what needs to be updated, remove everything that has not changed
											for (let i = 0, j = results.length, m = StocksOfTextFile.length; i < j; i++) {
												if (typeof results[i] != 'undefined') {
													let ticker = results[i]['Ticker symbol'];

													for (let n = 0; n < m; n++) {
														if (typeof StocksOfTextFile[n] != 'undefined') {
															if (ticker == StocksOfTextFile[n][0]) {
																delete results[i];
																delete StocksOfTextFile[n];

																for (let h = 0; h < j; h++)
																	if (typeof results[h] != 'undefined')
																		if (ticker == results[h]['Ticker symbol'])
																			delete results[h];
																for (let h = 0; h < m; h++)
																	if (typeof StocksOfTextFile[h] != 'undefined')
																		if (ticker == StocksOfTextFile[h][0])
																			delete StocksOfTextFile[h];
															}
														}
													}
												}
											}
											
											//Transfer results objects to StocksOfDataBase array
											for (let n = 0, m = results.length; n < m; n++) {
												if (typeof results[n] != 'undefined')
													StocksOfDataBase.push([results[n]['Ticker symbol'], results[n]['Common Stock'],
													results[n]['Security Name'], results[n]['Industry Group'], results[n]['Industry'],
													results[n]['Sub-Industry']]);
											}
											
											//Remove duplicates from Array
											for (let n = 0, m = StocksOfTextFile.length; n < m; n++) {
												if (typeof StocksOfTextFile[n] != 'undefined') {
													let ticker = StocksOfTextFile[n][0];
													for (let g = 0; g < m; g++)
														if (g != n)
															if (typeof StocksOfTextFile[g] != 'undefined')
																if (ticker == StocksOfTextFile[g][0])
																	delete StocksOfTextFile[g];
												}
											}
											for (let n = 0, m = StocksOfDataBase.length; n < m; n++) {
												if (typeof StocksOfDataBase[n] != 'undefined') {
													let ticker = StocksOfDataBase[n][0];
													for (let g = 0; g < m; g++)
														if (g != n)
															if (typeof StocksOfDataBase[g] != 'undefined')
																if (ticker == StocksOfDataBase[g][0])
																	delete StocksOfDataBase[g];
												}
											}
											
											//Remove empty items
											let _StocksOfTextFile = []
											for (let r = 0, l = StocksOfTextFile.length; r < l; r++) {
												if (typeof StocksOfTextFile[r] != 'undefined')
													_StocksOfTextFile.push(StocksOfTextFile[r]);
											}
											let _StocksOfDataBase = []
											for (let r = 0, l = StocksOfTextFile.length; r < l; r++) {
												if (typeof StocksOfDataBase[r] != 'undefined')
													_StocksOfDataBase.push(StocksOfDataBase[r]);
											}
											StocksOfTextFile = _StocksOfTextFile;
											StocksOfDataBase = _StocksOfDataBase;
											
											console.log(StocksOfTextFile);
											console.log(StocksOfDataBase);

											if (StocksOfTextFile.length > 0) {
												let InsertStatment = "INSERT INTO \`nasdaqusa\`.\`stocks\` (\`Ticker symbol\`, \`Common Stock\`, \`Security Name\`) \
																	  VALUES ?;";

												connection.query(InsertStatment, [StocksOfTextFile], _AddStocks);
											}
											if (StocksOfDataBase.length > 0) {
												let RemoveStatment = "DELETE FROM \`nasdaqusa\`.\`stocks\` WHERE \`Ticker symbol\` IN (?);";
												let TickerSymbols = [];
												for (let r = 0, l = StocksOfDataBase.length; r < l; r++)
													TickerSymbols.push(StocksOfDataBase[r][0]);
												connection.query(RemoveStatment, [TickerSymbols], _RemoveStocks);
											}
											
											console.log("DONE");
											//this.emit('success');
										}
										
										function _GetStocks() {
											let getdatastring = `SELECT * FROM nasdaqusa.stocks LIMIT 10000;`;
											connection.query(getdatastring, _ProccessRecivedData);
										}

										this.GetStocks = _GetStocks;
									};
									util.inherits(_InteractionWithMySQL, events.EventEmitter);
									let InteractionWithMySQL = new _InteractionWithMySQL();
									
									InteractionWithMySQL.on('error', function (error) {
										console.log("error!");
									});
									InteractionWithMySQL.on('success', function (data) {
										console.log(data);
									});
									
									InteractionWithMySQL.GetStocks();
								});
							});
						});
						stream.pipe(fs.createWriteStream('otherlisted-copy.txt'));
					});
				});
				//stream.on('readable', function() {
					// There is some data to read now.
					//let data;

					//while (data = this.read()) {
					//console.log(data);
					//}
				//});
				stream.pipe(fs.createWriteStream('nasdaqlisted-copy.txt'));
			});
			//c.list(function(err, list) {
				//if (err) throw err;
				//console.log(list);
				//c.end();
			//});
		});
	});
	
	// connect to nasdaq ftp server
	c.connect({
		host: "ftp.nasdaqtrader.com"
	});
}
async function getFilteredNasdaqTickerList(FilterRules) {
	// get all nasdaq tickers and then filter theme according to FilterRules
	let tickers = await getAllNasdaqTickers();
	
	if (tickers != -1) {
		switch (FilterRules) {
			case "only Common Stock": // [ticker, name of stock]
				{
					let OutputArray = [];
					for (let n = 0, nn = tickers.length; n < nn; n++) {
						if ((tickers[n][1].includes("Common Stock")))
							OutputArray.push(tickers[n]);
					}
					return OutputArray;
				}
				break;
			case "only tickers Common Stock": // [ticker]
				{
					let OutputArray = [];
					for (let n = 0, nn = tickers.length; n < nn; n++) {
						if ((tickers[n][1].includes("Common Stock")))
								OutputArray.push(tickers[n][0].replace(/\./g, '-')); // replace . (dots) with "-"
					}
					
					return OutputArray;
				}
				break;
			default:
				break;
		}
	}
	return tickers;
}
async function getAllNasdaqTickers() {
	// if the 2 data files, are 3 hours old, we need to re-download theme
	let CurrentDate = new Date();
	let returnValue;
	return await new Promise((resolve) => {
		// 1. do the 2 files exist, if not download theme
		fs.stat('nasdaqlisted-copy.txt', async function (err, stats) {
			if (err) { // download the files if they do not exist
				returnValue = await downloadNasdaqTickers();
				if (returnValue == -1) {
					console.log("ERROR! Can not download or find the 2 files needed for the ticker list!");
					resolve(returnValue);
					//throw err;
				}
			}
			
			fs.stat('otherlisted-copy.txt', async function (err, stats) {
				if (err) { // we tried to download the files, but did not work, something is not working, return error
					console.log("ERROR! Can not download or find the 2 files needed for the ticker list!");
					resolve(-1);
					//throw err;
				}
				
				// 2. download the files if they are more then 3 hours old
				if (CurrentDate.getFullYear() != stats.ctime.getFullYear() || 
					CurrentDate.getMonth() != stats.ctime.getMonth() || 
					CurrentDate.getDay() != stats.ctime.getDay() ||
					(CurrentDate.getHours() - stats.ctime.getHours()) > 3) {
						// the files are older then 3 hours, which mean they are old, so we re-download theme
						returnValue = await downloadNasdaqTickers();
						if (returnValue == -1) {
							console.log("ERROR! Can not download or find the 2 files needed for the ticker list!");
							resolve(returnValue);
						}
					}
					
				// 3. get the info and return it
				returnValue = [];
				let readInterface0 = readline.createInterface({ input: fs.createReadStream('nasdaqlisted-copy.txt') });
				readInterface0.on('line', function(line) {
					line = line.split('|');
					if (!(line[0].includes("File Creation Time")) && !(line[0].includes("Symbol")))
							returnValue.push([line[0], line[1]]);
				});
				readInterface0.on('close', function () {
					let readInterface1 = readline.createInterface({ input: fs.createReadStream('otherlisted-copy.txt') });
					readInterface1.on('line', function(line) {
						line = line.split('|');
						if (!(line[0].includes("File Creation Time")) && !(line[0].includes("Symbol")))
							returnValue.push([line[0], line[1]]);
					});
					readInterface1.on('close', function () {
						resolve(returnValue);
					});
				});
			});
		});
	});
}
async function downloadNasdaqTickers() {
	let c = new FtpClient();
	
	// connect to nasdaq ftp server
	c.connect({
		host: "ftp.nasdaqtrader.com"
	});
	
	return await new Promise((resolve) => {
		c.on('ready', function() {
			c.cwd("/SymbolDirectory/", (err, currentDir) => {
				if (err) throw err;
				c.get('nasdaqlisted.txt', function(err, stream) {
					if (err) throw err;
					stream.once('close', function() {
						console.log("has finnished downloading \"nasdaqlisted.txt\".");
						c.get('otherlisted.txt', function(err, stream) {
							if (err) throw err;
							stream.once('close', function() {
								console.log("has finnished downloading \"otherlisted.txt\".");
								c.end();
								resolve(0);
							});
							stream.pipe(fs.createWriteStream('otherlisted-copy.txt'));
						});
					});
					stream.pipe(fs.createWriteStream('nasdaqlisted-copy.txt'));
				});
			});
		});
	});
}

function PrintCommands()
{
	console.log("'help' Display this info.")
	console.log("'exit' Terminate program.")
}
function init() {
	startBrowser();
}
async function main() {
	let loop = true, line = '';
	
	init();
	
	while (loop) {
		line = await askQuestion();
		switch (line)
		{
			case 'c':
			case "connect":
				ConnectingToMySQL();
				break;
			case 'd':
			case "disconnect":
				DisconnectToMySQL();
				break;
			case "insert":
				InsertToMyMySQL();
				break;
			case "get data":
				GetDataFromMySQL();
				break;
			//case "scrap sp500":
			case 'g':
			case "get all stocks":
				//UpdateNasdaqStockList2();
				UpdateNasdaqStockList();
				break;
			case "get amd stock": //https://finance.yahoo.com/quote/AMD
				GetStockInfoYahoo('https://finance.yahoo.com/quote/AMD');
				break;
			case 'cookies':
				GetCookies();
				break;
			case 'q':
			case 'e':
			case 'exit':
			case 'quit':
			case 'close':
				console.log("Terminating script.");
				closeBrowser();
				loop = false;
				break;
			case 'help':
				PrintCommands();
				break;
			default:
				console.log("error...(type 'help' for more info)");
				break;
		}
	}
	
	ClearConsoleIO();
}
main();
