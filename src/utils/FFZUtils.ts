/**
* Created : 02/05/2022 
*/
export default class FFZUtils {

	private static _instance:FFZUtils;

	private enabled = false;
	private emotesLoaded = false;
	private channelList:string[] = [];
	private globalEmotes:FFZEmote[] = [];
	private globalEmotesHashmaps:{[key:string]:FFZEmote} = {};
	private channelEmotes:{[key:string]:FFZEmote[]} = {};
	private channelEmotesHashmaps:{[key:string]:{[key:string]:FFZEmote}} = {};
	
	constructor() {
	
	}
	
	/********************
	* GETTER / SETTERS *
	********************/
	static get instance():FFZUtils {
		if(!FFZUtils._instance) {
			FFZUtils._instance = new FFZUtils();
		}
		return FFZUtils._instance;
	}
	
	
	
	/******************
	* PUBLIC METHODS *
	******************/
	/**
	 * Adds a channel to the list of FFZ emotes to load
	 */
	public addChannel(channelId:string):void {
		this.channelList.push(channelId);
		this.emotesLoaded = false;
	}

	/**
	 * Generates a fake IRC emote tag for future emotes parsing.
	 * 
	 * @param message 
	 * @returns string
	 */
	public generateEmoteTag(message:string, protectedRanges:boolean[]):string {
		if(!this.enabled) return "";

		let fakeTag = "";
		let allEmotes:FFZEmote[] = [];
		let emotesDone:{[key:string]:boolean} = {};
		const chunks = message.split(/\s/);
		for (let i = 0; i < chunks.length; i++) {
			const txt = chunks[i];
			if(this.globalEmotesHashmaps[txt.toLowerCase()]) {
				const emote = this.globalEmotesHashmaps[txt.toLowerCase()];
				if(emote && emotesDone[emote.name] !== true) {
					allEmotes.push( emote );
					emotesDone[emote.name] = true;
				}
			}
			//TODO parse only the emotes from the channel the message was posted to
			for (const key in this.channelEmotesHashmaps) {
				const emote = this.channelEmotesHashmaps[key][txt.toLowerCase()];
				if(emote && emotesDone[emote.name] !== true) {
					allEmotes.push( emote );
					emotesDone[emote.name] = true;
				}
			}
		}

		//Parse global emotes
		for (let i = 0; i < allEmotes.length; i++) {
			const e = allEmotes[i];
			const name = e.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
			const matches = [...message.matchAll(new RegExp(name, "gi"))];
			if(matches && matches.length > 0) {
				//Current emote has been found
				//Generate fake emotes data in the expected format:
				//  ID:start-end,start-end/ID:start-end,start-end
				// fakeTag += "FFZ_"+e.id+":";
				let tmpTag = "FFZ_"+e.id+":";
				let emoteCount = 0;
				for (let j = 0; j < matches.length; j++) {
					const start = (matches[j].index as number);
					const end = start+e.name.length-1;

					if(protectedRanges[start] === true) continue;
					if(protectedRanges[end] === true) continue;

					const prevOK = start == 0 || /\s/.test(message.charAt(start-1));
					const nextOK = end == message.length-1 || /\s/.test(message.charAt(end+1));
					//Emote has no space before and after or is not at the start or end of the message
					//ignore it.
					if(!prevOK || !nextOK) continue;
					emoteCount++;
					tmpTag += start+"-"+end;

					if(j < matches.length-1) tmpTag+=",";
				}
				if(emoteCount) {
					fakeTag += tmpTag;
					if(i < allEmotes.length -1 ) fakeTag +="/";
				}
			}
		}

		return fakeTag;
	}

	/**
	 * Get a FFZ emote data from its code
	 * @param code 
	 * @returns 
	 */
	public getEmoteFromCode(code:string):FFZEmote|null {
		if(this.globalEmotesHashmaps[code.toLowerCase()]) {
			return this.globalEmotesHashmaps[code.toLowerCase()];
		}
		for (const key in this.channelEmotesHashmaps) {
			const list = this.channelEmotesHashmaps[key];
			if(this.channelEmotesHashmaps[key][code.toLowerCase()]) {
				return this.channelEmotesHashmaps[key][code.toLowerCase()];
			}
		}
		return null;
	}

	/**
	 * Enables FFZ emotes
	 * Loads up the necessary emotes
	 */
	public async enable():Promise<void> {
		if(!this.emotesLoaded) {
			await this.loadGlobalEmotes();
			for (let i = 0; i < this.channelList.length; i++) {
				await this.loadChannelEmotes( this.channelList[i] );
			}
		}
		this.enabled = true;
		this.emotesLoaded = true;
	}

	/**
	 * Disable FFZ emotes
	 */
	public async disable():Promise<void> {
		this.enabled = false;
	}
	
	
	
	/*******************
	* PRIVATE METHODS *
	*******************/

	private async loadGlobalEmotes():Promise<void> {
		try {
			const res = await fetch("https://api.frankerfacez.com/v1/set/global");
			const json = await res.json();
			if(json.sets) {
				let emotes:FFZEmote[] = [];
				for (const key in json.sets) {
					if(json.sets[key]?.emoticons.length > 0) {
						emotes = emotes.concat(json.sets[key].emoticons)
					}
				}
				this.globalEmotes = emotes;
				emotes.forEach(e => {
					this.globalEmotesHashmaps[e.name.toLowerCase()] = e;
				});
			}
		}catch(error) {
			//
		}
	}
	
	private async loadChannelEmotes(channelId:string):Promise<void> {
		try {
			const res = await fetch("https://api.frankerfacez.com/v1/room/id/"+channelId);
			const json = await res.json();
			if(json.sets) {
				let emotes:FFZEmote[] = [];
				for (const key in json.sets) {
					if(json.sets[key]?.emoticons.length > 0) {
						emotes = emotes.concat(json.sets[key].emoticons)
					}
				}
				this.channelEmotes[channelId] = emotes;
				this.channelEmotesHashmaps[channelId] = {};
				emotes.forEach(e => {
					this.channelEmotesHashmaps[channelId][e.name.toLowerCase()] = e;
				});
			}
		}catch(error) {
			//
		}
	}
}

interface FFZEmote {
	id: number;
	name: string;
	height: number;
	width: number;
	public: boolean;
	hidden: boolean;
	modifier: boolean;
	offset?: unknown;
	margins?: unknown;
	css?: unknown;
	owner: {
		_id: number;
		name: string;
		display_name: string;
	};
	urls: {
		1: string;
		2: string;
		4: string;
	};
	status: number;
	usage_count: number;
	created_at: Date;
	last_updated: Date;
}