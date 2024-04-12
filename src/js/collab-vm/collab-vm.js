import common from "./common";
import { en_us_qwerty_keyboard } from "./en-us-qwerty";

import { History } from "./jquery.history.js";

// this was a PITA to make work but it's not nearly as ass as the concatenation bullshit we had going before
import Guacamole from '../guacamole/Guacamole.js'

/** @const
 * Max number of characters in a chat message.
 */
window.maxChatMsgLen = 100;

/** @const
 * Max number of chat messages to store.
 */
window.maxChatMsgHistory = 100;

/**
 * Whether the user has control over the VM or not.
 * @type {boolean}
 */
var hasTurn = false;
var modPerms = 0;
var turnInterval = null;
var voteInterval = null;
/**
 * Whether the user has voted or not.
 * @type {boolean}
 */
var hasVoted;
var focused = false;
var display;
var tunnel;
var guac;
var mouse;
var keyboard;
var audioSupported;
var blurSupported;
var chatSoundOn = true;

/**
 * An array containing promise resolvers and usernames for the Get IP function
 */
var iptasks = [];

/**
 * The current on-screen keyboard, if any.
 * @type Guacamole.OnScreenKeyboard
 */
var osk = null;
/** Whether the NSFW warning is currently visible.
 * @type {boolean}
 */
var nsfwWarn = true;
// WaitingIndex = 0, Not waiting
// 1 = HasTurn
// >1 = Index in line
var users = [];
// Number of users in queue plus one
var usersWaiting = 0;
// Name: [UserRank, WaitingIndex]
/** {dict} */
var usersData = {};
/** @type {string} */
window.username = null;

/**
 * The name of the VM that the user is currently viewing 
 * or trying to view.
 * @type {string}
 */
window.vmName = null;

/**
 * Whether the client is connecting to a VM and viewing it.
 * @type {boolean}
 */
var connected = false;

/**
 * List of the nodes this instance of the webapp knows about.
 */
var nodeList = [];

/**
 * Gets the CSS class associated with a user rank.
 * @param {number} rank
 * @return {string}
 */
function getRankClass(rank) {
	switch (rank) {
		default:
		case 0: // Guest
			return "";
		case 1: // Registered user
			return "user";
		case 2: // Admin
			return "admin";
		case 3: // Moderator
			return "moderator";
	}
}

/**
 * Define a PIP entity incase supported.
 */
//var pictureInPictureVideo;

/**
 * Define a CollabVM Authentication URL
 */
var authUrl = "";
/**
 * Define whether the user is authenticated or not.
 */
var loggedIn = false;
/**
 * Define the current session token
 */
var session = "";

function cvm_unescape(str) {
	return str.replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&#x2F;/g,'/').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#13;/g,'\r').replace(/&#10;/g,'\n');
}

var admin = {
	loginTimesPressed: 0,

	copyIP: async function(user) {
		var ip = await this.getIP(user);
		navigator.clipboard.writeText(ip);
	},

	getIP: function(user) {
		return new Promise(res => {
			iptasks.push({username: user, res: res});
			tunnel.sendMessage("admin", 19, user);
		});
	},

	// I've named this "VM Monitor" instead of "QEMU Monitor" in the case that more hypervisors are supported in the future.
	vmMonitor: {
		output: function(output) {
			var outputBox = document.getElementById("vm-monitor-output");
			outputBox.value += cvm_unescape(output);
			outputBox.scrollTop = outputBox.scrollHeight;
		},
		input: function(input) {
			if (tunnel.state == Guacamole.Tunnel.State.OPEN && input != "") {
				tunnel.sendMessage("admin", 5, vmName, input);
				this.output("> " + input + "\n");
			};
		},
		sendFromDialog: function() {
			var inputBox = document.getElementById("vm-monitor-input");
			this.input(inputBox.value.trim());
			inputBox.value = "";
		}
	},
	renameUser: function(oldName) {
		var newName = prompt("Change name from " + oldName + " to? (Leave blank to reset)", oldName);
		if (newName != null) {
			if (newName == "") {
				tunnel.sendMessage("admin", 18, oldName);
			} else {
				tunnel.sendMessage("admin", 18, oldName, newName);
			};
		};
	},

	// This is the ONLY exposed way to send a "arbitrary" tunnel instruction
	adminInstruction: function() {
		// This only looks ugly because we need to use ES5 syntax
		var args = Array.prototype.slice.call(arguments, 0); args.unshift("admin");
		tunnel.sendMessage.apply(null, args); // ("admin", ...)
	}
};

function adminLoginBoxClicker() {
	++admin.loginTimesPressed;

	if (admin.loginTimesPressed == 4) {
		var passwd = prompt("🔑"); // move this to bootstrap's dialogs?
		if (passwd != null) tunnel.sendMessage("admin", 2, passwd);
	}

	// it works I don't care
	setTimeout(function(){
		admin.loginTimesPressed = 0;
	}, 1500);
};

function addTableRow(table, user, userData) {
	var data = document.createElement("LI");
	data.className = "list-group-item";

	var userHTML;
	if (usersData[username] && (usersData[username][0] == 2 || usersData[username][0] == 3) && user !== username) {
		// Maybe eventually I should somehow categorise these, this is getting crowded
		userHTML = `<div class='dropdown-toggle' data-toggle='dropdown' role='button' aria-haspopup='true' aria-expanded='false'>${user}<span class='caret'></span></div><ul class='dropdown-menu'>`;
		if (modPerms & 64) userHTML += `<li><a href='#' onclick='GetAdmin().adminInstruction(16,"${user}");return false;'>End Turn</a></li>`;
		if (modPerms & 4) userHTML += `<li><a href='#' onclick='GetAdmin().adminInstruction(12,"${user}");return false;'>Ban</a></li>`;
		if (modPerms & 32) userHTML += `<li><a href='#' onclick='GetAdmin().adminInstruction(15,"${user}");return false;'>Kick</a></li>`;
		if (modPerms & 128) userHTML += `<li><a href='#' onclick='GetAdmin().renameUser("${user}");return false;'>Change Name</a></li>`; // Maybe eventually I should move this to a HTML prompt instead
		if (modPerms & 16) {
			userHTML += `<li><a href='#' onclick='GetAdmin().adminInstruction(14,"${user}",0);return false;'>Temporary Mute</a></li>`;
			userHTML += `<li><a href='#' onclick='GetAdmin().adminInstruction(14,"${user}",1);return false;'>Indefinite Mute</a></li>`;
			userHTML += `<li><a href='#' onclick='GetAdmin().adminInstruction(14,"${user}",2);return false;'>Unmute</a></li>`;
		};
		if (modPerms & 256) userHTML += `<li><a href='#' onclick='GetAdmin().copyIP("${user}");return false;'>Copy IP</a></li>`;
		userHTML += "</ul>";
	} else {
		userHTML = user;
	}
	data.innerHTML = userHTML;
	
	var rank = getRankClass(userData[0]);
	if (rank)
		data.className += " " + rank;
	if (userData[1] === 1) {
		data.className += " has-turn";
	} else if (userData[1] > 1) {
		data.className += " waiting-turn";
	}
	if (user == username)
		data.className += " current-user";
	table.appendChild(data);
}

function displayTable() {
	$("#users-online").html(users.length);
	var table = $("#online-users").empty().get(0);
	
	if (usersWaiting > 0) {
		for (var x = 1; x < usersWaiting+1; x++) {
			for (var i = 0; i < users.length; i++) {
				var user = users[i];
				var userData = usersData[user];
				if (userData[1] === x)
					addTableRow(table, user, userData);
			}
		}
		for (var i = 0; i < users.length; i++) {
			var user = users[i];
			var userData = usersData[user];
			if (userData[1] === 0)
				addTableRow(table, user, userData);
		}
	} else {
		for (var i = 0; i < users.length; i++) {
			var user = users[i];
			var userData = usersData[user];
			addTableRow(table, user, userData);
		}
	}
}

function chatMessage(username, message) {
	var chatPanel = $("#chat-panel").get(0);
	var atBottom = chatPanel.offsetHeight + chatPanel.scrollTop >= chatPanel.scrollHeight;
	var chatElement = $('<li><div></div></li>');
	if (username)
		chatElement.children().first().html(message).prepend($('<span class="username"></span>').addClass(usersData[username] ? getRankClass(usersData[username][0]) : "").text(username), '<span class="spacer">\u25B8</span>');
	else
		chatElement.children().first().addClass("server-message").html(message);
	var chatBox = $("#chat-box");
	var children = chatBox.children();
	if (children.length >= maxChatMsgHistory)
		children.first().remove();
	chatBox.append(chatElement);
	if (atBottom)
		chatPanel.scrollTop = chatPanel.scrollHeight;
	playSound();
}

function getCookie(cname) {
	var name = cname + "=";
	var ca = document.cookie.split(';');
	for(var i=0; i<ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0)==' ') c = c.substring(1);
		if (c.indexOf(name) == 0) return c.substring(name.length,c.length);
	}
	return "";
}

function setCookie(cname, cvalue, exdays) {
	var d = new Date();
	d.setTime(d.getTime() + (exdays*24*60*60*1000));
	var expires = "expires="+d.toUTCString();
	document.cookie = cname + "=" + cvalue + "; " + expires;
}

function initSound() {
	if (!!document.createElement('audio').canPlayType) {
		var a = document.createElement('audio');
		if (!!(a.canPlayType('audio/mpeg;').replace(/no/, ""))) {
			audioSupported = new Audio(common.chatSound + ".mp3");
		} else if (!!(a.canPlayType('audio/ogg; codecs="vorbis"').replace(/no/, ""))) {
			audioSupported = new Audio(common.chatSound + ".ogg");
		} else if (!!(a.canPlayType('audio/mp4; codecs="mp4a.40.2"').replace(/no/, ""))) {
			audioSupported = new Audio(common.chatSound + ".m4a");
		}
	}
}

function setChatSoundOn(on) {
	chatSoundOn = on;
	if (chatSoundOn) {
		$("#chat-sound-btn").children().first().removeClass("glyphicon-volume-off").addClass("glyphicon-volume-up");
	} else {
		$("#chat-sound-btn").children().first().removeClass("glyphicon-volume-up").addClass("glyphicon-volume-off");
	}
}

function playSound() {
	if (chatSoundOn) {
		if (audioSupported !== null) {
			audioSupported.play();
		} else {
			$("#chat-sound bgsound").remove();
			$("<bgsound/>").attr({ src: "notify.mp3", loop: 1, autostart: true }).appendTo("#chat-sound");
		}
	}
}

/**
 * Create a timer that calls the callback every second.
 * @param callback The function that is called every second with the following declaration:
 *				function(seconds, dots)
 *				@param seconds The number of seconds remaining or null if the timer has expired
 *				@param dots A string with 0 to 4 dots to indicate progress
 * @param ms The number of milliseconds the timer should start with.
 * @return The intervalID from setInterval()
 */
function waitingTimer(callback, ms, completion) {
	var interval;
	var dots = '';
	var timerCallback = function() {
			var seconds = Math.floor(ms / 1000);
			if (seconds <= 0) {
				clearInterval(interval);
				callback(null);
			} else {
				if (dots.length < 3)
					dots += '.';
				else
					dots = '';
				callback(seconds, dots);
			}
		};
	timerCallback();
	return interval = setInterval(function() { ms -= 1000; timerCallback(); }, 1000);
}

function setFocus(focus) {
	focused = focus;
	if (focus) {
		keyboard.onkeydown = function (keysym) {
			if (hasTurn)
				guac.sendKeyEvent(1, keysym);
			};

		keyboard.onkeyup = function (keysym) {
			if (hasTurn)
				guac.sendKeyEvent(0, keysym);
			};

	} else {
		keyboard.onkeydown = keyboard.onkeyup = null;
	}
}

/**
 * Enables or disables the on-screen keyboard.
 * @param {boolean} enabled
 */
function activateOSK(enabled) {
	osk.disabled = !enabled;
	var keys = $(osk.getElement()).find("div.guac-keyboard-key");
	if (enabled)
		keys.removeClass("guac-keyboard-disabled");
	else
		keys.addClass("guac-keyboard-disabled");
}

/**
 * Shows or hides the NSFW warning message.
 * @param {boolean=} show False if the NSFW warning message should be hidden. Defaults to true.
 */
function displayNsfwWarn(show) {
	if (show === false) {
		$("#display").removeClass("censor").removeClass("censor-fallback");
		$("#vm-list img").removeClass("censor").removeClass("censor-fallback");
		$("#warning").hide();
		nsfwWarn = false;
	} else {
		// First try to use the blur filter to the display
		var el = $("#display");
		// Add the filter-blur property to the element
		el.addClass("censor");
		// Check whether the style is computed or ignored
		blurSupported = el.css("filter") || el.css("-webkit-filter");
		if (blurSupported) {
			//checking for false positives of IE
			blurSupported = (document.documentMode === undefined //non-IE browsers, including ancient IEs
				|| document.documentMode > 9 //IE compatibility mode
				);
		}
		// Cover it with white if blur is not supported
		if (!blurSupported)
			el.addClass("censor-fallback");
		$("#warning").show();
		// TODO: Apply blur to any existing thumbnails in the VM list?
		nsfwWarn = true;
	}
}

/**
 * Shows or hides the loading animation.
 * @param {boolean=} show False if the loading animation should be hidden. Defaults to true.
 */
function displayLoading(show) {
	if (show === false) {
		$("#loading").hide();
		$("#status").html("");
	} else {
		$("#loading").show();
		$("#status").html("Loading...");
	}
}

/**
 * Shows or hides the VM list.
 * @param {boolean=} show False if the VM list should be hidden. Defaults to true.
 */
function displayVMList(show) {
	if (show === false) {
		$("#vm-list").hide();
	} else {
		$("#vm-view").hide();
		$("#vm-list").show();
	}
}

/**
 * Shows or hides the VM viewer.
 * @param {boolean=} show False if the VM viewer should be hidden. Defaults to true.
 */
function displayVMView(show) {
	if (show === false) {
		$("#vm-view").hide();
	} else {
		$("#vm-list").hide();
		$("#vm-view").show();
		osk.resize($("#kbd-container").width());
	}
}

/**
 * Update vote stats.
 */
function setVoteStats(parameters) {
	common.debugLog(parameters);
	$("#vote-label-yes").html(parameters[2]);
	$("#vote-label-no").html(parameters[3]);
	if (voteInterval)
		clearInterval(voteInterval);
	var ms = parseInt(parameters[1]);
	var voteStatus = function() {
		ms -= 1000;
		var seconds = Math.floor(ms / 1000);
		if (seconds <= 0) {
			clearInterval(voteInterval);
		} else {
			$("#vote-time").html(seconds);
		}
	};
	voteStatus();
	$("#vote-stats").show();
	
	voteInterval = setInterval(voteStatus, 1000);

	if (!hasVoted) {
		$("#vote-alert").show();
	}

	if (usersData[username][0] == 2 || (usersData[username][0] == 3 && modPerms & 8))
	{
		$("#vote-cancel").show();
	} else {
		$("#vote-cancel").hide();
	}
	
	if (usersData[username][0] == 2 || (usersData[username][0] == 3 && (modPerms & 8 && modPerms & 1)))
	{
		$("#vote-pass").show();
	} else {
		$("#vote-pass").hide();
	}
}

/**
 * Update the actions available to the user.
 */
function updateActions(parameters) {
	// Turns enabled
	// if (parameters[0] === "1")
	
	// Voting enabled
	if (parameters[1] === "1")
		$("#vote-btn").show();
	else
		$("#vote-btn").hide();
	
}

// long live DartzCodingTM
function InitalizeGuacamoleClient() {
	common.debugLog("InitalizeGuacamoleClient called");
	
	// Get display div from document
	display = document.getElementById("display");
	
	guac = new Guacamole.Client(tunnel);
	
	guac.getDisplay().getElement().addEventListener("click", function() {
		if (!hasTurn && !nsfwWarn)
			tunnel.sendMessage("turn");
	});

	// pip code moved to button due to performance reasons just dont ask ok
	// and to fix performance issues even more just disable this completely for now
	// document.pictureInPictureEnabled ? $("#pip-btn").show() : $("#pip-btn").hide();

	$("#vm-monitor-send").click(function() {
		admin.vmMonitor.sendFromDialog();
	});

	$("#vm-monitor-input").keypress(function(key) {
		if (key.which === 13) {
			admin.vmMonitor.sendFromDialog();
		}
	});

	$("#username-btn").prop("disabled", false);
	$("#username-btn").click(function() {
		if (authUrl === "") {
			$("#username-modal").modal("show");
		} else {
			if (loggedIn) {
				// POST the server to revoke the session
				var xhr = new XMLHttpRequest();
				xhr.open("POST", authUrl + "/api/v1/logout", true);
				xhr.responseType = "text";
				xhr.setRequestHeader("Content-Type", "application/json");
				xhr.addEventListener('readystatechange', function() {
					if (xhr.readyState !== xhr.DONE) return;
					var response = JSON.parse(xhr.response);
					if (!response.success) alert("Failed to revoke session: " + response.error);
					localStorage.removeItem("collabvm_session_" + new URL(authUrl).host);
					// Once the home button is fixed we should return to the VM list instead of this
					window.location.reload();
				});
				xhr.send(JSON.stringify({ token: session }));
				loggedIn = false;
				session = "";
				$("#username-btn").html("Login");
			} else {
				showAuthenticationDialog();
			}
		}
	});
	$("#chat-user").on("click", adminLoginBoxClicker);
	
	// Error handler
	guac.onerror = function(error) {
		common.debugLog(error);
	};
	
	tunnel.onstatechange = function(state) {
		if (state == Guacamole.Tunnel.State.CLOSED) {
			displayLoading();
			displayVMList(false);
			authUrl = "";
			loggedIn = false;
			session = "";
			$("#authentication-captcha").html("");
			$("#username-btn").html("Change Username");
			$("#username-btn").prop("disabled", true);
			$("#chat-user").off("click");
			activateOSK(false);
			// Remove display element
			var e = guac.getDisplay().getElement();
			if (e.parentNode == display)
				display.removeChild(e);
			// Reset variables
			connected = false;
			users = [];
			usersWaiting = 0;
			usersData = {};
			window.username = null;
			setFocus(false);
			hasTurn = false;
			$("#turn-btn").show();
			$("#end-turn-btn").hide();
			$("#vote-cancel").hide();
			$("#vote-pass").hide();
			$("#admin-btns").hide();
			if (turnInterval !== null) {
				clearInterval(turnInterval);
				turnInterval = null;
				$("#status").html("");
			}
			if (voteInterval !== null) {
				clearInterval(voteInterval);
				voteInterval = null;
			}
			display.className = "";
			displayTable();
			$("#chat-send-btn").prop("disabled", true);
			$("#chat-input").prop("disabled", true);
			$("#chat-user").hide().html("");
			// Attempt to reconnect in 10 seconds
			setTimeout(function (){tunnel.state = Guacamole.Tunnel.State.CONNECTING; guac.connect();}, 10000);
		} else if (state == Guacamole.Tunnel.State.OPEN) {
			hasVoted = false;
			displayLoading();
			
			// Request a username
			window.username = getCookie("username");
			if (username)
				tunnel.sendMessage("rename", username);
			else
				tunnel.sendMessage("rename");
			
			if (vmName) {
				tunnel.sendMessage("connect", vmName);
			}
			// Add display element
			display.appendChild(guac.getDisplay().getElement());
			
			$("#chat-send-btn").prop("disabled", false);
			$("#chat-input").prop("disabled", false);
			$("#chat-user").show();

		}
	};

	// Turn handler
	guac.onturn = function(parameters) {
		common.debugLog("Turn: ");
		common.debugLog(parameters);
		// Clear all user data
		for (var i = 0; i < users.length; i++)
			usersData[users[i]][1] = 0;

		usersWaiting = parseInt(parameters[1]);
		var num = usersWaiting + 2;
		for (var i = 2; i < num; i++) {
			usersData[parameters[i]][1] = i-1;
		}
		if (num > 2 && parameters[2] == username) {
			// The user has control
			hasTurn = true;
			$("#turn-btn").hide();
			$("#end-turn-btn").show();
			
			display.className = "focused";
			if (turnInterval !== null)
				clearInterval(turnInterval);
			// Round the turn time up to the nearest second
			turnInterval = waitingTimer(function(seconds) {
					if (seconds !== null) {
						$("#status").html("Your turn expires " + "in ~" + seconds + " seconds");
					} else {
						turnInterval = null;
						$("#status").html("");
					}
				}, Math.round(parseInt(parameters[0])/1000)*1000);
		} else if (parameters.length > num) {
			// The user is waiting for control
			hasTurn = false;
			$("#turn-btn").hide();
			$("#end-turn-btn").show();
			display.className = "waiting";
			if (turnInterval !== null)
				clearInterval(turnInterval);
			turnInterval = waitingTimer(function(seconds, dots) {
					if (seconds !== null) {
						$("#status").html("Waiting for turn " + "in ~" + seconds + " seconds" + dots);
					} else {
						turnInterval = null;
						$("#status").html("");
					}
				}, Math.round(parseInt(parameters[parameters.length-1])/1000)*1000);
		} else {
			if (turnInterval !== null || hasTurn) {
				hasTurn = false;
				$("#status").html("");
				$("#turn-btn").show();
				$("#end-turn-btn").hide();
				display.className = "";
				if (turnInterval !== null) {
					clearInterval(turnInterval);
					turnInterval = null;
				}
			}
		}
		activateOSK(hasTurn);
		displayTable();
	};
	
	// Rename Handler
	guac.onrename = function(parameters) {
		if (parameters[0] === "0") {
			// Change this user's username
			var newUsername = username === null;
			// Remove old username if it's in the list
			if (!newUsername) {
				for (var x = 0; x < users.length; x++) {
					if (users[x] == username) {
						users.splice(x, 1);
						break;
					}
				}
			}
			window.username = parameters[2];
			$("#username-btn").prop("disabled", false);
			$("#chat-user").html(username);
			// Add the username to the users array if it's not
			// already in it
			if ($.inArray(username, users) == -1)
				users.push(username);
			usersData[username] = [0, 0];
			setCookie("username", username, 365);

			// Check status
			if (parameters[1] === "1") {
				// Username taken
				alert("That username is already taken.");
			} else if (parameters[1] === "2") {
				alert("Usernames can contain only numbers, letters, spaces, dashes, underscores, and dots, and it must be between 3 and 20 characters.");
			} else if (parameters[1] === "3") {
				alert("That username has been blacklisted.");
			}
		} else if (parameters[0] === "1") {
			var oldUsername = parameters[1];
			// Change another user's username
			for (var i = 0; i < users.length; i++) {
				if (users[i] == oldUsername) {
					users[i] = parameters[2];
					break;
				}
			}
			usersData[parameters[2]] = usersData[oldUsername];
			delete usersData[oldUsername];
		}
		displayTable();
	};
	
	guac.onconnect = function(parameters) {
		switch (parseInt(parameters[0])) {
			case 0: // Failed to connect
				alert("Failed to connect to VM.")
				break;
			case 1: // Connected
				updateActions(parameters.slice(1));
				$("#chat-box").empty();
				$("#vote-alert").hide();
				$("#vote-stats").hide();
				displayVMView();
				// Request the username that was stored in the cookie
				// or send an empty username for the server to generate
				// a new one
				if (username === null) {
					tunnel.sendMessage("rename", getCookie("username"));
				}
				// Successfully connected to VM
				connected = true;
				displayLoading(false);
				break;
			case 2: // Disconnected
				connected = false;
				hasTurn = false;
				$("#turn-btn").show();
				$("#end-turn-btn").hide();
				if (turnInterval !== null)
					clearInterval(turnInterval);
				if (voteInterval !== null)
					clearInterval(voteInterval);

				// Redirect to VM list
				History.pushState(null, null, common.rootDir);
				break;
			case 3: {
				alert("The server does not accept your webapp's version.")
				break;
			}
		}
	};
	
	guac.onadmin = function(parameters) {
		if (parameters[0] === "0") {
			// this sucks please rewrite eventually
			var rank = 0;
			$("#vm-monitor-btn").hide();
			if (parameters[1] === "1") {
				rank = 2;
				modPerms = 65535;
				$("#vm-monitor-btn").show();
			} else if (parameters[1] === "3") {
				rank = 3;
				modPerms = parseInt(parameters[2]);
			}
			if (rank)
				$("#admin-btns").show();
			else
				$("#admin-btns").hide();
			if (rank == 2 || (rank == 3 && modPerms & 1))
				$("#restore-btn").show();
			else
				$("#restore-btn").hide();
			if (rank == 2 || (rank == 3 && modPerms & 2))
				$("#reboot-btn").show();
			else
				$("#reboot-btn").hide();
			if (rank == 2 || (rank == 3 && (modPerms & 1 || modPerms & 2)))
				$("#power-dropdown").show();
			else
				$("#power-dropdown").hide();
			if (rank == 2 || (rank == 3 && modPerms & 8))
				$("#vote-cancel").show();
			else
				$("#vote-cancel").hide();
			if (rank == 2 || (rank == 3 && (modPerms & 8 && modPerms & 1)))
				$("#vote-pass").show();
			else
				$("#vote-pass").hide();
			if (rank == 2 || (rank == 3 && modPerms & 64)) {
				$("#clear-turn-queue-btn").show();
				$("#end-current-turn-btn").show();
				$("#bypass-turn-btn").show();
			} else {
				$("#clear-turn-queue-btn").hide();
				$("#end-current-turn-btn").hide();
				$("#bypass-turn-btn").hide();
			}
		} else if (parameters[0] === "2") {
			admin.vmMonitor.output(parameters[1] + "\n");
		} else if (parameters[0] === "18") {
			if (parameters[1] === "1") {
				alert("That username is already taken.");
			} else if (parameters[1] === "2") {
				alert("Usernames can contain only numbers, letters, spaces, dashes, underscores, and dots, and it must be between 3 and 20 characters.");
			};
		} else if (parameters[0] === "19") {
			console.log(`${parameters[1]} - ${parameters[2]}`); // Log it in case this crappy copy method fails
			var tsk = iptasks.find(t => t.username == parameters[1]);
			if (tsk) {
				tsk.res(parameters[2]);
				iptasks.splice(iptasks.indexOf(tsk), 1);
			}
		};
	};
	
	guac.onadduser = function(parameters) {
		common.debugLog("Add user: ");
		common.debugLog(parameters);
		var num = parseInt(parameters[0])*2 + 1;
		for (var i = 1; i < num; i += 2) {
			if(parameters[i] !== username || usersData[parameters[i]][0] != parameters[i+1]) {
				// add user to the user list if they don't exist at all,
				// otherwise only update the user's rank from the server
				if(users.find((u)=> u == parameters[i]) == undefined)
					users.push(parameters[i]);

				var rank = parseInt(parameters[i+1]);
				usersData[parameters[i]] = [rank, 0];
			}
		}
		displayTable();
	};
	
	guac.onremuser = function(parameters) {
		common.debugLog("Remove user: ");
		common.debugLog(parameters);
		var num = parseInt(parameters[0]) + 1;
		for (var i = 1; i < num; i++) {
			var user = parameters[i];
			for (var x = 0; x < users.length; x++) {
				if (users[x] == user) {
					users.splice(x, 1);
					break;
				}
			}
			delete usersData[user];
		}
		displayTable();
	};
	
	guac.onchat = function(parameters) {
		for (var i = 0; i < parameters.length; i += 2)
			chatMessage(parameters[i], parameters[i+1]);
	};
	
	guac.onvote = function(parameters) {
		switch (parseInt(parameters[0])) {
			case 0:
				common.debugLog("Vote started");
			// Fall-through
			case 1:
				// Update vote stats
				common.debugLog("Update vote stats");
				setVoteStats(parameters);
			break;
			case 2:
				common.debugLog("Voting ended");
				$("#vote-alert").hide();
				$("#vote-stats").hide();
				hasVoted = false;
			break;
			case 3:
				alert("Please wait " + parameters[1] + " seconds before starting another vote.")
				hasVoted = false;
			break;
		}
	}

	function showAuthenticationDialog() {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", authUrl + "/api/v1/info", true);
		xhr.responseType = "text";
		xhr.onload = function() {
			if (xhr.readyState === xhr.DONE && xhr.status === 200) {
				var authData = JSON.parse(xhr.response);
				if(authData.hcaptcha.required) {
					hcaptcha.render(document.getElementById("authentication-captcha"), {"sitekey": authData.hcaptcha.siteKey});
				}
				$("#authentication-modal").modal({"keyboard": false});
			}
		}
		xhr.send(null);
	}

	guac.onauth = function(parameters) {
		authUrl = parameters[0];
		// per standard
		$("#chat-user").off("click");
		// so users can't accidentally hit the close button
		var token = localStorage.getItem("collabvm_session_" + new URL(authUrl).host);
		if (token) {
			session = token;
			tunnel.sendMessage("login", token);
		} else {
			$("#username-btn").html("Login");
		}
	}

	guac.onlogin = function(parameters) {
		if(parameters[0] === "1") {
			$("#username-btn").html("Logout");
			loggedIn = true;
			return;
		} else {
			// our token is invalid
			localStorage.removeItem("collabvm_session_" + new URL(authUrl).host);
			$("#username-btn").html("Login");
		}
	}

	document.addEventListener("mousedown", function() {
		if (focused)
			setFocus(false);
	});
	
	// Mouse
	mouse = new ("ontouchstart" in document ? Guacamole.Mouse.Touchscreen : Guacamole.Mouse)(guac.getDisplay().getElement());
	mouse.onmousedown = function(mouseState) {
		if (!focused)
			setFocus(true);
		if (hasTurn)
			guac.sendMouseState(mouseState);
	};
	mouse.onmouseup =
	mouse.onmousemove = function(mouseState) {
		if (hasTurn)
			guac.sendMouseState(mouseState);
	};
	
	// Keyboard
	keyboard = new Guacamole.Keyboard(document);
}

window.multicollab = function(ip, isWss) {
	if (typeof isWss !== 'undefined') {
		switch(isWss) {
		case true:
			var prefix = "wss://";
			break;
		case false:
			var prefix = "ws://";
			break;
		}
	}
	else { 
	var prefix = (location.protocol == "https:" ? "wss://" : "ws://");
	}
	
	var connTunnel = new Guacamole.WebSocketTunnel(prefix + ip + '/');
	
	connTunnel.onstatechange = function(code) {
		if (code == 2) {
			setTimeout(function() {
				listGuac.connect()
			}, 1000)
		} else if (code == 1) {
			connTunnel.sendMessage('connect')
			connTunnel.sendMessage('list')
		}
	}
	
	var listGuac = new Guacamole.Client(connTunnel);
	
	listGuac.onlist = function(e) {
		connTunnel.onstatechange = null;
		listGuac.disconnect();
		for (var i = 0; i < e.length; i += 3) {
			nodeList.push({
				ip: ip,
				url: e[i],
				name: e[i + 1],
				image: e[i + 2],
			});
	}
		
		nodeList.sort(function(a, b) {
			return a.url > b.url ? 1 : -1;
		});
			
		var vmlist = document.getElementById('vm-list')
		vmlist.innerHTML = "";
		
		for(var i in nodeList) {
			var thisnode = nodeList[i];
			var div = document.createElement('div');
			div.className = 'col-sm-5 col-md-3';
			var link = document.createElement('a');
			link.className = 'thumbnail';
			link.href = '#' + thisnode.url;
			link.innerHTML = (thisnode.image ? '<img src="data:image/png;base64,' + thisnode.image + '"/>' : '') + '<div class="caption"><h4>' + thisnode.name + '</h4></div>';
			if (thisnode.url === window.location.hash.substring(1)) openVM(link, prefix, thisnode);
			link.onclick = function(event) {
				openVM(event.target, prefix, thisnode);
			};
			div.appendChild(link);
			vmlist.appendChild(div);
			
			// Manually apply the nsfw blur if we have to
			if(nsfwWarn)
				$("#vm-list img").addClass("censor")
		}
	};
	
	listGuac.connect();
}

/**
 * Connect to a VM
 * @param {string} prefix
 * @param {string} elem 
 * @param {string} node 
 * @returns 
 */
function openVM(elem, prefix, node) {
	// Neither of these should execute now that we've removed the beacon but just in case
	if (tunnel) tunnel.onstatechange = null;
	if (guac) guac.disconnect(); // kill existing connection

	// can't use thisnode because that's incredibly broken
	// so we have to do this cursed being to get the node information
	
	while(elem.hash == undefined)
		elem = elem.parentElement;
	
	var hash = elem.hash;
	
	
	var node = nodeList.find(node => node.url == hash.substring(1));
	if(node == undefined) {
		common.debugLog("Node not found?");
		return;
	}
	
	var display = document.getElementById('display');
	if(display.firstChild)
			display.removeChild(display.firstChild);
		
	// set up the tunnel for InitalizeGuacamoleClient
	// WHY were we not using prefix here?
	tunnel = new Guacamole.WebSocketTunnel(prefix + node.ip + '/');
	vmName = node.url;
	common.serverAddress = node.ip;
	
	// connect to server
	common.debugLog("Connect to multicollab VM " + node.ip);
	InitalizeGuacamoleClient();
	guac.connect();
}

$(window).on("statechange", function() {
	common.debugLog("statechange callled");
});
	
(function() {
	// Try to set the text shadow property for the NSFW warning so it can
	// be seen on dark backgrounds
	var warnText = $("#warn-text");
	if (!warnText.css("text-shadow", "2px 2px #fff").css("text-shadow")) {
		// If the property is not supported, set the background color to white
		warnText.css("background-color", "white");
	}
	
	$("#nsfw-cont-btn").click(function() {
		displayNsfwWarn(false);
		if ($("#no-warn-chkbox").prop("checked")) {
			setCookie("no-nsfw-warn-v2", "1", 365);
		}
	});
	
	osk = new Guacamole.OnScreenKeyboard(en_us_qwerty_keyboard);
	activateOSK(false);
	$("#kbd-keys").append(osk.getElement());
	
	osk.onkeydown = function(keysym) {
		if (hasTurn)
			guac.sendKeyEvent(1, keysym);
	};
	
	osk.onkeyup = function(keysym) {
		if (hasTurn)
			guac.sendKeyEvent(0, keysym);
	};
	
	$("#osk-btn").click(function() {
		var kbd = $("#kbd-outer");
		if (kbd.is(":visible"))
			kbd.hide("fast");
		else
			kbd.show("fast");
	});
	
	$("#turn-btn").click(function() {
		if(tunnel.state == Guacamole.Tunnel.State.OPEN)
			tunnel.sendMessage("turn");
	});

	$("#end-turn-btn").click(function() {
		if(tunnel.state == Guacamole.Tunnel.State.OPEN)
			tunnel.sendMessage("turn","0");
	});

	$(window).resize(function() {
		if (osk)
			osk.resize($("#kbd-container").width());
	});
	
	$("#vote-btn").click(function() {
		hasVoted = true;
		tunnel.sendMessage("vote", "1");
	});
	
	$("#vote-yes").click(function() {
		if (!hasVoted) {
			hasVoted = true;
			tunnel.sendMessage("vote", "1");
			$("#vote-alert").hide();
		}
	});
	
	$("#vote-no").click(function() {
		if (!hasVoted) {
			hasVoted = true;
			tunnel.sendMessage("vote", "0");
			$("#vote-alert").hide();
		}
	});

	$("#vote-cancel").click(function() {
		tunnel.sendMessage("admin", "13", 0);
	});

	$("#vote-pass").click(function() {
		tunnel.sendMessage("admin", "13", 1);
	});
	
	$("#vote-dismiss").click(function() {
		$("#vote-alert").hide();
	});
	
	$('#username-modal').on('show.bs.modal', function (event) {
		$("#username-box").val(username);
	});

	$("#username-ok-btn").click(function() {
		var newUsername = $("#username-box").val().trim();
		if (newUsername) {
			$('#username-modal').modal("hide");
			common.debugLog("New Username: " + newUsername);
			// TODO: close modal when WebSocket disconnects
			if (tunnel.state == Guacamole.Tunnel.State.OPEN) {
				tunnel.sendMessage("rename", newUsername);
			}
		}
	});

	$("#username-box").keydown(function(e) {
		if (e.which === 13) {
			// Enter key
			e.preventDefault();
			$("#username-ok-btn").trigger("click");
		}
	});
	
	$("#restore-btn").click(function() {
		tunnel.sendMessage("admin", "8", vmName);
	});
	
	$("#reboot-btn").click(function() {
		tunnel.sendMessage("admin", "10", vmName);
	});
	
	$("#clear-turn-queue-btn").click(function() {
		tunnel.sendMessage("admin", "17", vmName);
	});
	
	$("#end-current-turn-btn").click(function() {
		for (var user in usersData) {
			if (usersData[user][1] == 1) {
				tunnel.sendMessage("admin", "16", user);
				break;
			};
		};
	});

	$("#bypass-turn-btn").click(function() {
		tunnel.sendMessage("admin", "20");
	});
	
	$("#home-btn").attr("href", "#").click(function(e) {
		// Don't do anything if the user is already on the home page
		if (!guac) return;
		// Disconnect from the server
		guac.disconnect();
		guac = null;
		tunnel = null;
		// Return to the home page
		$("#vm-view").hide();
		$("#vm-list").show();
	});
	
	$("#chat-input").keypress(function(e) {
		if (e.which === 13) {
			// Enter key sends chat message
			e.preventDefault();
			$("#chat-send-btn").trigger("click");
		} else if (this.value.length >= maxChatMsgLen) {
			e.preventDefault();
		}
	}).on("input", function() {
		// Truncate chat messages that are too long
		if (this.value.length > maxChatMsgLen)
			this.value = this.value.substr(0, maxChatMsgLen);
	});
	
	$("#chat-send-btn").click(function() {
		var chat = $("#chat-input");
		var msg = chat.val().trim();
		if (guac.currentState === Guacamole.Client.CONNECTED && msg) {
			tunnel.sendMessage("chat", msg);
			chat.val("");
		}
	});
	
	$("#chat-sound-btn").click(function() {
		setChatSoundOn(!chatSoundOn);
		setCookie("chat-sound", chatSoundOn ? "1" : "0", 365);
	});

	$("#authentication-login-btn").click(function() {
		var xhr = new XMLHttpRequest();
		var connectingUsername = $("#auth-username-box").val().trim();
		var connectingPassword = $("#auth-password-box").val();
		var captchaId = $("#authentication-captcha").children("iframe").attr("data-hcaptcha-widget-id");
		var captchaResponse = hcaptcha.getResponse(captchaId);
		if(captchaResponse === "") {
			alert("Missing captcha");
			return;
		}
		var loginData = JSON.stringify({
			"username": connectingUsername,
			"password": connectingPassword,
			"captchaToken": captchaResponse
		});
		xhr.open("POST", authUrl + "/api/v1/login", true);
		xhr.responseType = "text";
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.onreadystatechange = function() {
			hcaptcha.reset(captchaId);
			if (xhr.readyState === xhr.DONE && xhr.status === 200) {
				var response = JSON.parse(xhr.response);
				if(response.token) {
					localStorage.setItem("collabvm_session_" + new URL(authUrl).host, response.token);
					session = response.token;
					tunnel.sendMessage("login", response.token);
					// we have a token we're done with this dialog
					$("#authentication-modal").modal("hide");
				} else {
					console.error("Something went horribly wrong: " + xhr.responseText);
				}
			} else if (xhr.readyState === xhr.DONE) {
				var response = JSON.parse(xhr.response);
				if(response.error) {
					alert(response.error);
				}
			}
		};
		xhr.send(loginData);
	});

	initSound();

	setChatSoundOn(getCookie("chat-sound") != "0");

	displayNsfwWarn(!common.DEBUG_NO_NSFW && getCookie("no-nsfw-warn-v2") != "1");
	
	if (common.DEBUG_VM_LIST) {
		displayVMList();
		updateVMList(["win-xp", "Windows XP SP3", ""/*, "win-vista", "Windows Vista", "", "win-7", "Windows 7 Professional", ""*/]);
		$("#vm-list > div > a").prepend($("<img>", {"data-src": "holder.js/300x200"}));
		Holder.run();
		return;
	} else if (common.DEBUG_VM_VIEW) {
		displayVMView();
		return;
	}
	
	if (common.DEBUG_LOADING) {
		displayLoading();
		return;
	}
	
	if (common.DEBUG_NO_CONNECT)
		return;
	
	// Add the nodes in the configuration
	common.additionalNodes.forEach((node) => {
		common.debugLog("Add additional node " + node);
		multicollab(node);
	});	
	common.additionalNodesSecure.forEach((node) => {
		common.debugLog("Add additional secure node " + node);
		multicollab(node, true);
	});
})();

// Browser exports

// get the admin utils if needed
// this is dumb but Whatever(TM)
window.GetAdmin = function() {
	return admin;
}

// Disconnect on close
window.onunload = function() {
	guac.disconnect();
}
