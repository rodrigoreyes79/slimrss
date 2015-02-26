// -------------------------
// ViewModel object
// -------------------------
function ViewModel(eh, pref, api) {
	var self = this;
	var api = api;
	self.api = api;
	self.pref = pref;
	self.eventHub = eh;
	
	// Initialization
	self.initializing = ko.observable(true);
	
	// Login information
	self.autoLogin = ko.observable(true);
	self.username = ko.observable();
	self.password = ko.observable();
	self.loggedIn = ko.observable(false);

	// Categories
	self.cats = ko.observableArray();
	self.selectedCat = ko.observable();

	// Headlines
	self.heads = ko.observableArray();
	self.selectedHeader = ko.observable('');
	self.starredHeads = ko.observableArray();
	self.totalCount = ko.computed(function() {
		var total = 0;
		for(var i = 0; i < self.cats().length; i++){
			if(self.cats()[i].id > 0 && !isNaN(self.cats()[i].unread)) total += self.cats()[i].unread;
		}
		return total;
	});

	// Initial category
	self.parentId = defaultCats.ALL;
	
	// Screen state
	self.screenConf = {
		showCats: true,
		showNews: false,
		showLog: false
	}
	self.showMenuOptions = ko.observable(false);
	self.showCats  = ko.observable(true);
	self.showNews  = ko.observable(false);
	self.showLog  = ko.observable(false);
	self.showStarred = ko.observable(false);
	
	// Debug log
	self.log = ko.observable('');
	self.debugMode =  ko.observable(false);

	self.login = function() {
		var p = api.login(self.username(), self.password());
		p.then(function(response) {
			if (response['content'].error == 'LOGIN_ERROR') {
				window.alert("Username and/or Password were incorrect!");
			}
			if (response['content'].error == 'API_DISABLED') {
				window.alert("The API Setting is disabled. Login on the desktop version and enable API in the Preferences.");
			} else {
				$.cookie('g2tt_sid', response['content'].session_id, {
					expires: 7
				});
			}
			
			self.load();
		}).fail(function(data, e) {
			alert('Login failed: ' + e);
			if(self.debugMode()) alert('Data: ' + data);
		});
	}
	
	self.logout = function() {
		$.cookie('g2tt_sid', '');
		self.loggedIn(false);
	}
	
	self.load = function(){
		// Let's load the cats
		catsPromise = api.getOrderedCategories();
		
		// ... and the data for the default cat
		headlinesPromise = api.getHeadlines(pref.feed);
		
		$.when(catsPromise, headlinesPromise).done(function(cats, heads){
			if(cats.content.error){
				// Not logged in
				self.loggedIn(false);
				return;
			}
			
			self.selectedCat(cats.content[0]);
			self.cats(cats.content);
			
			self.heads(heads.content);
			self.loggedIn(true);
		});
	}
	
	self.selectCat = function(cat, ev, viewMode){
		var d = $.Deferred();
		
		// Do we need to load the categories?
		// We may be initializing from a reload
		self.reloadCats(cat.id);		
		
		self.selectedCat(cat);
		
		self.showStarred(false);
		
		// Changing URL
		history.pushState(null, null, "#/cat/" + cat.id + '/');
		
		var catId = cat.id;
		if(catId == -1) catId = -4;		
		
		// Let's load the headlines
		headlinesPromise = api.getHeadlines(catId, null, null, true, viewMode);
		
		$.when(headlinesPromise).done(function(heads){
			self.heads(heads.content);
			self.setNewsMode();
			
			// In case we are reloading
			if(!self.loggedIn()){
				self.loggedIn(true);
			}
			
			d.resolve();
		});
		
		return d.promise();
	}
	
	self.selectFeed = function(cat, ev, viewMode){
		// Do we need to load the categories?
		// We may be initializing from a reload
		self.reloadCats(cat.id);	
		
		self.selectedCat(cat);
		
		if(viewMode != 'marked'){
			self.showStarred(false);
		}
		
		// Let's load the headlines
		headlinesPromise = api.getHeadlines(cat.id, null, null, false, viewMode);
		
		$.when(headlinesPromise).done(function(heads){
			self.heads(heads.content);
			self.setNewsMode();
			
			// In case we are reloading
			if(!self.loggedIn()){
				self.loggedIn(true);
			}
		});
	}
	
	self.reloadCats = function(catId){
		if(self.cats().length < 1){
			self.updateCategories().then(function(){
				// Let's update the selected cat with the loaded info
				var loadedCat = ko.utils.arrayFirst(self.cats(), function(item) {
					return item.id == catId;
				});
				if(loadedCat){
					self.selectedCat(loadedCat);
				}
			});
		}
	}
	
	self.updateCategories = function(){
		var d = $.Deferred();
		api.getOrderedCategories().then(function(cats){
			if(cats.content.error){
				// Not logged in
				self.loggedIn(false);
			} else {
				self.cats(cats.content);
			}
			d.resolve();
		});
		return d.promise();
	}
	
	self.openHeader = function(head){
		// Changing URL
		if(!self.showStarred()){
			history.pushState(null, null, "#/cat/" + self.selectedCat().id + '/header/' + head.id);
		}
		
		// Now, let's open
		window.open(head.link, head.id);
	}
	
	self.markAsRead = function(){
		// Let's get all the ids
		var ids = [];
		for(var i = 0; i < self.heads().length; i++){
			ids.push(self.heads()[i].id);
		}
		
		self.markIdsAsRead(ids);
	}
	
	self.catchup = function(data){
		var id = data.id;
		
		// Let's get all the ids until the selected article
		var ids = [];
		for(var i = 0; i < self.heads().length; i++){
			if(self.heads()[i].id == id) break;
			ids.push(self.heads()[i].id);
		}
		
		self.markIdsAsRead(ids).then(function(){
			heads.content[0].more(true);
		});
	}
	
	self.markIdsAsRead = function(ids){
		var d = $.Deferred();
		marPromise = api.markAsRead(ids);
		
		$.when(marPromise).then(function(){
			self.updateCategories();
			self.selectedCat().unreadCount(self.selectedCat().unreadCount() - ids.length);
			
			var catId = self.selectedCat().id;
			if(catId == -1) catId = -4;
			
			return api.getHeadlines(catId);
		}).done(function(heads){
			self.heads(heads.content);
			
			// If nothing left, let's go back to the cats
			if(heads.content.length < 1){
				self.setCatsMode();
			} else {
				self.scrollToTop();
			}
			
			d.resolve();
		});
		
		return d.promise();
	}
	
	self.toggleStar = function(item) {
		item.marked(!item.marked());
		if(self.selectedHeader() == item.id) self.selectedHeader('');
		
		// Now, let's update it
		api.toggleStar(item.id);
	}
	
	self.selectStarred = function() {
		// Changing URL
		history.pushState(null, null, "#/starred");
		
		self.showStarred(true);
		self.selectFeed({'id': -4, 'title': 'Starred'}, null, 'marked');
	}
	
	// --------------------
	// Category expansion
	// --------------------
	self.toggleCat = function(cat) {
		if(cat.collapsed()){
			self.expandCat(cat);
		} else {
			self.collapseCat(cat);
		}
	}
	
	self.expandCat = function(cat) {
		if(!cat.subCatsLoaded()){
			api.getFeeds(cat.id).then(function(feeds){
				cat.subCats(feeds.content);
				cat.collapsed(false);
				cat.subCatsLoaded(true);
			});
		}
		
		cat.collapsed(false);
	}
	
	self.collapseCat = function(cat){
		cat.collapsed(true);
	}
		
	
	
	// -----------------------
	// Screen status methods
	// -----------------------
	
	self.setNewsMode = function(){
		self.setScreenMode({
			showCats: false,
			showNews: true,
			showLog: false
		});
	}
	
	self.setCatsMode = function(){
		self.setScreenMode({
			showCats: true,
			showNews: false,
			showLog: false
		});
	}
	
	self.setLogMode = function(){
		self.setScreenMode({
			showCats: false,
			showNews: false,
			showLog: true
		});
	}
	
	self.setScreenMode = function(screenConf){
		self.screenConf = screenConf;
		if(self.showMenuOptions()){
			self.showCats(self.screenConf.showCats);
			self.showNews(self.screenConf.showNews);
			self.showLog(self.screenConf.showLog);
		} else {
			self.showCats(true);
			self.showNews(true);
			self.showLog(self.debug());
		}
		self.scrollToTop();
	}
	
	self.screenResize = function(){
		// Waiting for half a second before any calculations
		setTimeout(function(){
			self.debug('Screen resize: ' + head.screen.innerWidth);
			if(head.screen.innerWidth < 992){
				// Small screen. Let's use the menu options
				self.showMenuOptions(true);

				// Let's restore the last screen conf
				self.showCats(self.screenConf.showCats);
				self.showNews(self.screenConf.showNews);
				self.showLog(self.screenConf.showLog);
			} else if(head.screen.innerWidth >= 768){
				self.showMenuOptions(false);

				// Let's store the screen conf (if not showing both)
				if(!(self.showCats() && self.showNews())){
					self.screenConf.showCats = self.showCats();
					self.screenConf.showNews = self.showNews();
					self.screenConf.showLog = self.showLog();

					// Now, let's show it all
					self.showCats(true);
					self.showNews(true);
				}
			}
		}, 100);
	}
	
	self.scrollToTop = function(){
		$("html, body").animate({ scrollTop: 0 }, "slow");
	}
	
	self.showHeader = function(id){
		var sel = '#head-' + id;
		var newsPanel = $(sel);
		if(newsPanel.length > 0){
			$('html, body').animate({
				scrollTop: newsPanel.offset().top - 45
			}, "slow");
		}
		history.pushState(null, null, "#/cat/" + self.selectedCat().id + '/header/' + id);
		self.selectedHeader(id);
	}
	
	self.debug = function(str){
		if(self.debugMode()) self.log(self.log() + '\n' + str);
	}
}