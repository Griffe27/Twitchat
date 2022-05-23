import store, { TriggerActionTypes, TriggerActionChatCommandData } from '@/store';
import { IRCEventDataList } from '@/utils/IRCEvent';
import OBSWebsocket, { OBSTriggerEventTypes } from '@/utils/OBSWebsocket';
import TwitchUtils from './TwitchUtils';
import Utils from './Utils';

/**
* Created : 22/04/2022 
*/
export default class TriggerActionHandler {

	private static _instance:TriggerActionHandler;

	private actionsSpool:MessageTypes[] = [];
	private userCooldowns:{[key:string]:number} = {};
	private globalCooldowns:{[key:string]:number} = {};
	private currentSpoolGUID:string = "";
	
	constructor() {
	
	}
	
	/********************
	* GETTER / SETTERS *
	********************/
	static get instance():TriggerActionHandler {
		if(!TriggerActionHandler._instance) {
			TriggerActionHandler._instance = new TriggerActionHandler();
			TriggerActionHandler._instance.initialize();
		}
		return TriggerActionHandler._instance;
	}
	
	
	
	/******************
	* PUBLIC METHODS *
	******************/
	public onMessage(message:MessageTypes, testMode:boolean = false):void {
		if(testMode) {
			this.actionsSpool = [message];
			this.executeNext(testMode);
		}else{
			this.actionsSpool.push(message);
			if(this.actionsSpool.length == 1) {
				this.executeNext();
			}
		}
	}
	
	private async executeNext(testMode:boolean = false):Promise<void>{
		this.currentSpoolGUID = Math.random().toString()
		const message = this.actionsSpool[0];
		if(!message) return;

		if((message.type == "message" || message.type == "highlight")) {
			switch(message.tags["msg-id"]) {
				case "follow": this.handleFollower(message, testMode, this.currentSpoolGUID); return;

				case "sub": 
				case "resub": 
				case "giftpaidupgrade": this.handleSub(message, testMode, this.currentSpoolGUID); return;
				
				case "subgift": this.handleSubgift(message, testMode, this.currentSpoolGUID); return;

				case "raid": this.handleRaid(message, testMode, this.currentSpoolGUID); return;
			}

			if(message.reward) {
				if(await this.handleReward(message as IRCEventDataList.Highlight, testMode, this.currentSpoolGUID)) {
					return;
				}
			}
			if(message.tags["first-msg"] === true) {
				if(await this.handleFirstMessageEver(message, testMode, this.currentSpoolGUID)) {
					return;
				}
			}
			if(message.firstMessage === true) {
				if(await this.handleFirstMessageToday(message, testMode, this.currentSpoolGUID)) {
					return;
				}
			}
			if(message.tags.bits) {
				if(await this.handleBits(message, testMode, this.currentSpoolGUID)) {
					return;
				}
			}
			if(message.message) {
				if(await this.handleChatCmd(message as IRCEventDataList.Message, testMode, this.currentSpoolGUID)) {
					return;
				}
			}

		}else if(message.type == "prediction") {
			if(await this.handlePrediction(message, testMode, this.currentSpoolGUID)) {
				return;
			}
		
		}else if(message.type == "poll") {
			this.handlePoll(message, testMode, this.currentSpoolGUID);
			return;
		
		}else if(message.type == "bingo") {
			this.handleBingo(message, testMode, this.currentSpoolGUID);
			return;

		}else if(message.type == "raffle") {
			this.handleRaffle(message, testMode, this.currentSpoolGUID);
			return;
		}

		this.actionsSpool.shift();
		this.executeNext();
	}

	
	
	/*******************
	* PRIVATE METHODS *
	*******************/
	private initialize():void {
		
	}

	private async handleFirstMessageEver(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.FIRST_ALL_TIME, message, testMode, guid);
	}
	
	private async handleFirstMessageToday(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.FIRST_TODAY, message, testMode, guid);
	}
	
	private async handleBits(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.BITS, message, testMode, guid);
	}
	
	private async handleFollower(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.FOLLOW, message, testMode, guid);
	}
	
	private async handleSub(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.SUB, message, testMode, guid);
	}
	
	private async handleSubgift(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.SUBGIFT, message, testMode, guid);
	}
	
	private async handlePoll(message:IRCEventDataList.PollResult, testMode:boolean, guid:string):Promise<boolean> {
		let winnerVotes = 0;
		message.data.choices.forEach(v=>{
			if(v.votes > winnerVotes) {
				winnerVotes = v.votes;
				message.winner = v.title;
			}
		});
		return this.parseSteps(OBSTriggerEventTypes.POLL_RESULT, message, testMode, guid);
	}
	
	private async handlePrediction(message:IRCEventDataList.PredictionResult, testMode:boolean, guid:string):Promise<boolean> {
		message.data.outcomes.forEach(v=>{
			if(v.id == message.data.winning_outcome_id) {
				message.winner = v.title;
			}
		});
		return this.parseSteps(OBSTriggerEventTypes.PREDICTION_RESULT, message, testMode, guid);
	}
	
	private async handleBingo(message:IRCEventDataList.BingoResult, testMode:boolean, guid:string):Promise<boolean> {
		message.winner = message.data.winners[0];
		return this.parseSteps(OBSTriggerEventTypes.BINGO_RESULT, message, testMode, guid);
	}
	
	private async handleRaffle(message:IRCEventDataList.RaffleResult, testMode:boolean, guid:string):Promise<boolean> {
		message.winner = message.data.winners[0];
		return this.parseSteps(OBSTriggerEventTypes.RAFFLE_RESULT, message, testMode, guid);
	}
	
	private async handleRaid(message:IRCEventDataList.Message|IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		return this.parseSteps(OBSTriggerEventTypes.RAID, message, testMode, guid);
	}
	
	private async handleChatCmd(message:IRCEventDataList.Message, testMode:boolean, guid:string):Promise<boolean> {
		const cmd = message.message.trim();
		return this.parseSteps(OBSTriggerEventTypes.CHAT_COMMAND+"_"+cmd, message, testMode, guid);
	}
	
	private async handleReward(message:IRCEventDataList.Highlight, testMode:boolean, guid:string):Promise<boolean> {
		if(message.reward) {
			let id = message.reward.redemption.reward.id;
			if(id == "TEST_ID") {
				id = OBSTriggerEventTypes.REWARD_REDEEM;
			}else{
				id = OBSTriggerEventTypes.REWARD_REDEEM+"_"+id;
			}
			return await this.parseSteps(id, message, testMode, guid);
		}
		return false;
	}

	/**
	 * Executes the steps of the trigger
	 * 
	 * @param eventType 
	 * @param message 
	 */
	private async parseSteps(eventType:string, message:MessageTypes, testMode:boolean, guid:string):Promise<boolean> {
		const steps = store.state.triggers[ eventType ];
		if(!steps) {
			return false;
		}else{
			let actions:TriggerActionTypes[] = [];
			let canExecute = true;

			if(!Array.isArray(steps)) {
				const data = steps as TriggerActionChatCommandData;
				actions = data.actions;
				const m = message as IRCEventDataList.Message;
				const uid = m.tags['user-id'];
				const key = eventType+"_"+uid;
				const now = Date.now();
				
				//check permissions
				if(!Utils.checkPermissions(data.permissions, m.tags)) {
					canExecute = false;
				}else{
					//Apply cooldowns if any
					if(this.globalCooldowns[eventType] > 0 && this.globalCooldowns[eventType] > now) canExecute = false;
					else if(data.cooldown.global > 0) this.globalCooldowns[eventType] = now + data.cooldown.global * 1000;
	
					if(this.userCooldowns[key] > 0 && this.userCooldowns[key] > now) canExecute = false;
					else if(canExecute && data.cooldown.user > 0) this.userCooldowns[key] = now + data.cooldown.user * 1000;
				}

			}else{
				actions = steps;
			}

			if(testMode) canExecute = true;
			
			if(!steps || actions.length == 0) canExecute = false;
			// console.log(steps);
			// console.log(message);
			
			if(canExecute) {
				for (let i = 0; i < actions.length; i++) {
					if(guid != this.currentSpoolGUID) return false;//Stop there, something asked to override the current exec
					const step = actions[i];
					if(step.type == "obs") {
						if(step.text) {
							const text = await this.parseText(eventType, message, step.text as string);
							await OBSWebsocket.instance.setTextSourceContent(step.sourceName, text);
						}
						if(step.url) {
							const url = await this.parseText(eventType, message, step.url as string, true);
							await OBSWebsocket.instance.setBrowserSourceURL(step.sourceName, url);
						}
						if(step.mediaPath) {
							await OBSWebsocket.instance.setMediaSourceURL(step.sourceName, step.mediaPath);
						}
			
						if(step.filterName) {
							OBSWebsocket.instance.setFilterState(step.sourceName, step.filterName, step.show);
						}else{
							OBSWebsocket.instance.setSourceState(step.sourceName, step.show);
						}
					}
					await Utils.promisedTimeout(step.delay * 1000);
				}
			}
		}

		//Remove item done
		this.actionsSpool.shift();
		if(this.actionsSpool.length > 0) {
			this.executeNext();
		}

		return true;
	}

	/**
	 * Replaces placeholders by their values on the message
	 */
	private async parseText(eventType:string, message:MessageTypes, src:string, urlEncode:boolean = false):Promise<string> {
		let res = src;
		eventType = eventType.replace(/_.*$/gi, "");//Remove suffix to get helper for the global type
		const helpers = TriggerActionHelpers[eventType];
		for (let i = 0; i < helpers.length; i++) {
			const h = helpers[i];
			const chunks:string[] = h.pointer.split(".");
			let value = message as unknown;
			try {
				for (let i = 0; i < chunks.length; i++) {
					value = (value as {[key:string]:unknown})[chunks[i]];
				}
			}catch(error) {
				console.warn("Unable to find pointer for helper", h);
				value = "";
			}
			
			if(h.tag === "SUB_TIER") {
				if(!isNaN(value as number) && (value as number) > 0) {
					value = Math.round((value as number)/1000)
				}else{
					value = 1;//Fallback just in case but shouldn't be necessary
				}
			}

			if(h.tag === "MESSAGE") {
				const m = message as IRCEventDataList.Highlight;
				if(m.message) {
					//Parse emotes
					const chunks = TwitchUtils.parseEmotes(m.message as string, m.tags['emotes-raw'], true);
					let cleanMessage = ""
					for (let i = 0; i < chunks.length; i++) {
						const v = chunks[i];
						if(v.type == "text") {
							cleanMessage += v.value+" ";
						}
					}
					value = cleanMessage.trim();
				}
			}
			
			if(value && eventType === OBSTriggerEventTypes.BITS && h.tag === "MESSAGE") {
				//Parse cheermotes
				const m = message as IRCEventDataList.Highlight;
				value = await TwitchUtils.parseCheermotes(value as string, m.tags['room-id'] as string);
			}

			if(value && typeof value == "string") {
				//Strip HTML tags (removes emotes and cheermotes)
				value = (value as string).replace(/<\/?\w+(?:\s+[^\s/>"'=]+(?:\s*=\s*(?:".*?[^"\\]"|'.*?[^'\\]'|[^\s>"']+))?)*?>/gi, "");
				
				if(urlEncode) {
					value = encodeURIComponent(value as string);
				}
			}
			if(value == undefined) value = "";
			res = res.replace(new RegExp("\\{"+h.tag+"\\}", "gi"), value as string);
		}
		return res;
	}
}


type MessageTypes = IRCEventDataList.Message
| IRCEventDataList.Highlight
| IRCEventDataList.Message
| IRCEventDataList.PredictionResult
| IRCEventDataList.PollResult
| IRCEventDataList.BingoResult
| IRCEventDataList.RaffleResult;

export const TriggerActionHelpers:{[key:string]:{tag:string, desc:string, pointer:string}[]} = {};

TriggerActionHelpers[OBSTriggerEventTypes.FIRST_ALL_TIME] = [
	{tag:"USER", desc:"User name", pointer:"tags.display-name"},
	{tag:"MESSAGE", desc:"Message content", pointer:"message"},
];

TriggerActionHelpers[OBSTriggerEventTypes.FIRST_TODAY] = [
	{tag:"USER", desc:"User name", pointer:"tags.display-name"},
	{tag:"MESSAGE", desc:"Message content", pointer:"message"},
];

TriggerActionHelpers[OBSTriggerEventTypes.POLL_RESULT] = [
	{tag:"TITLE", desc:"Poll title", pointer:"data.title"},
	{tag:"WIN", desc:"Winning choice title", pointer:"winner"},
	// {tag:"PERCENT", desc:"Votes percent of the winning choice", pointer:""},
];

TriggerActionHelpers[OBSTriggerEventTypes.PREDICTION_RESULT] = [
	{tag:"TITLE", desc:"Prediction title", pointer:"data.title"},
	{tag:"WIN", desc:"Winning choice title", pointer:"winner"},
];

TriggerActionHelpers[OBSTriggerEventTypes.BINGO_RESULT] = [
	{tag:"WINNER", desc:"Winner name", pointer:"winner.display-name"},
];

TriggerActionHelpers[OBSTriggerEventTypes.RAFFLE_RESULT] = [
	{tag:"WINNER", desc:"Winner name", pointer:"winner.user.display-name"},
];

TriggerActionHelpers[OBSTriggerEventTypes.CHAT_COMMAND] = [
	{tag:"USER", desc:"User name", pointer:"tags.display-name"},
];

TriggerActionHelpers[OBSTriggerEventTypes.SUB] = [
	{tag:"USER", desc:"User name", pointer:"tags.display-name"},
	{tag:"SUB_TIER", desc:"Sub tier 1, 2 or 3", pointer:"methods.plan"},
	{tag:"MESSAGE", desc:"Message of the user", pointer:"message"},
];

TriggerActionHelpers[OBSTriggerEventTypes.SUBGIFT] = [
	{tag:"USER", desc:"User name of the sub gifter", pointer:"tags.display-name"},
	{tag:"RECIPIENT", desc:"Recipient user name", pointer:"recipient"},
	{tag:"SUB_TIER", desc:"Sub tier 1, 2 or 3", pointer:"methods.plan"},
	{tag:"MESSAGE", desc:"Message of the user", pointer:"message"},
];

TriggerActionHelpers[OBSTriggerEventTypes.BITS] = [
	{tag:"USER", desc:"User name", pointer:"tags.display-name"},
	{tag:"BITS", desc:"Number of bits", pointer:"tags.bits"},
	{tag:"MESSAGE", desc:"Message of the user", pointer:"message"},
];

TriggerActionHelpers[OBSTriggerEventTypes.FOLLOW] = [
	{tag:"USER", desc:"User name of the new follower", pointer:"tags.username"},
];

TriggerActionHelpers[OBSTriggerEventTypes.RAID] = [
	{tag:"USER", desc:"User name of the new follower", pointer:"username"},
	{tag:"VIEWERS", desc:"Number of viewers", pointer:"viewers"},
];

TriggerActionHelpers[OBSTriggerEventTypes.REWARD_REDEEM] = [
	{tag:"USER", desc:"User name", pointer:"tags.display-name"},
	{tag:"TITLE", desc:"Reward title", pointer:"reward.redemption.reward.title"},
	{tag:"DESCRIPTION", desc:"Reward description", pointer:"reward.redemption.reward.prompt"},
	{tag:"COST", desc:"Reward cost", pointer:"reward.redemption.reward.cost"},
];