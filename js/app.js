var defaultCats = {
	ALL: -4,
	ALL_EXCEPT_VIRTUAL: -3
}


// -------------------------
// Model storing preferences
// -------------------------
function PrefModel(feed, viewMode, orderBy, feedSort, rootUrl) {
	var self = this;

	self.rootUrl = rootUrl;
	self.isCat = false;
	self.feed = feed;
	self.viewMode = viewMode;
	self.orderBy = orderBy;
	self.feedSort = feedSort;
	self.feedLimit = 25;
}

// -------------------------
// TTRSS API Data Access Object
// -------------------------
function ApiDAO(pref) {
	var self = this;
	self.loading = ko.observable(0);
	
	// Binding global events
	$(document).bind("ajaxStop", function(){
		self.loading(0);
	}).bind("ajaxError", function(jqXHR, textStatus){
		alert('Error: ' + textStatus.statusText);
		console.log(textStatus);
	});

	self.apiCall = function(data, asynch) {
		self.loading(self.loading() + 1);
		if (typeof(asynch) === 'undefined') asynch = true;
		data.sid = $.cookie('g2tt_sid');
		data = JSON.stringify(data);
		
		var d = $.Deferred();
		var request = $.ajax({
			url: pref.rootUrl + "/api/",
			type: "post",
			dataType: "text",
			data: data,
			asynch: asynch,
			timeout: 30 * 1000,
			cache: false,
			complete: function(){
				self.loading(self.loading() - 1);
			},
			success: function(data){
				try{
					data = JSON.parse(data);
					d.resolve(data);
				} catch (e) {
					d.reject(data, e);
				}
			}
		});

		return d.promise();
	}

	self.login = function(username, password) {
		var data = {
			'op': 'login',
			'user': username,
			'password': password,
		};
		return self.apiCall(data);
	}

	self.getUnread = function() {
		var data = new Object();
		data.op = "getUnread";
		return self.apiCall(data);
	}

	self.getCategories = function() {
		var data = new Object();
		data.op = "getCategories";
		data.enable_nested = true;
		return self.apiCall(data).then(self.formatCats);
	}
	
	self.getOrderedCategories = function() {
		var d = $.Deferred();
		self.getCategories().done(function(cats){
			if(!cats.content.error){
				cats.content = cats.content.sort(function(a,b){
					if(!a.order_id) return -1;
					if(!b.order_id) return 1;

					if(a.order_id > b.order_id){
						return 1;
					} else if(a.order_id < b.order_id){
						return -1;
					} else {
						return 0;
					}
				});
			}
			d.resolve(cats);
		});
		return d.promise();
	}

	self.getTitle = function() {
		var data = new Object();
		if (pref.IsCat == "true") {
			data.op = "getCategories";
		} else {
			data.op = "getFeeds";
			data.cat_id = "-4";
		}

		return self.apiCall(data);
	}

	self.getHeadlines = function(catId, since, search, is_cat, viewMode) {
		var data = new Object();
		data.op = "getHeadlines";
		data.feed_id = catId;
		data.limit = pref.feedLimit;
		data.show_excerpt = 0;
		data.show_content = 1;
		data.include_attachments = 0;
			
		if(!viewMode) viewMode = pref.viewMode;
		data.view_mode = viewMode;
		
		if(is_cat === undefined) is_cat = true;
		data.is_cat = is_cat;
		data.include_nested = true;
		data.order_by = pref.orderBy;
		if (pref.OrderBy == "date_reverse") {
			data.since_id = since;
		} else {
			var request = 
				data.skip = since;
		}
		data.search = search;
		return self.apiCall(data).then(self.formatNews);
	}

	self.refreshCats = function() {
		var data = new Object();
		data.op = "getCounters";
		data.output_mode = "fc";
		return self.apiCall(data);
	}

	self.getCategoriesForNewSubscribe = function() {
		var data = new Object();
		data.op = "getFeedTree";
		data.include_empty = true;

		data.enable_nested = false;
		return self.apiCall(data);
	}
	
	self.markAsRead = function(ids) {
		var data = new Object();
		data.op = "updateArticle";
        data.article_ids = ids.join(',');
        data.mode = 0;
        data.field = 2;
        return self.apiCall(data);
	}
	
	self.getFeeds = function(parent_id) {
		var data = new Object();
		data.op = "getFeeds";
		data.cat_id = parent_id;
		data.include_nested = true;
		return self.apiCall(data).then(self.formatCats);
	}
	
	self.toggleStar = function(id) {
		var data = new Object();
		data.op = "updateArticle";
		data.article_ids = id;
		data.field = 0;
		data.mode = 2;
		return self.apiCall(data);	
	}
	
	// Object formatters
	self.formatCats = function(cats){
		var d = $.Deferred();
		if(!cats.content.error){
			for(var i = 0; i < cats.content.length; i++) {
				cats.content[i].collapsed = ko.observable(true);
				cats.content[i].unreadCount = ko.observable(cats.content[i].unread);
				cats.content[i].subCatsLoaded = ko.observable(false);
				cats.content[i].subCats = ko.observableArray();
				cats.content[i].icon = pref.rootUrl + '/feed-icons/' + cats.content[i].id + '.ico';
			}
		}
		d.resolve(cats);
		return d;
	}
	
	self.formatNews = function(news){
		var d = $.Deferred();
		if(!news.content.error){
			for(var i = 0; i < news.content.length; i++) {
				if(!news.content[i].id) news.content[i].id = i;
				news.content[i].more = ko.observable(news.content[i].content.length < 150);
				news.content[i].icon = pref.rootUrl + '/feed-icons/' + news.content[i].feed_id + '.ico';
				news.content[i].marked = ko.observable(news.content[i].marked);
			}
		}
		d.resolve(news);
		return d;
	}

}

// -------------------------
// Categories Manager Object
// -------------------------
function CategoriesManager() {
	var self = this;

	// Categories
	self.cats = ko.observableArray();
	self.selectedCat = ko.observable();

	self.index = null;

	self.cats.subscribe(function(newVal){
		self.index = {};
		for(var i = 0; i < newVal.length; i++){
			self.index[newVal[i].feed_id] = newVal[i];
		}
	})

	self.updateCats = function(){
		var d = $.Deferred();
		api.getOrderedCategories().then(function(cats){
			if(cats.content.error){
				// Not logged in
				d.reject();
			} else {
				if(!self.index){
					self.cats(cats.content);
				} else {
					// Now, we only need to update the categories we already have
					// loaded in memory.
					var content = cats.content;
					for(var i = 0; i < content.length; i++){
						var tmp = content[i];
						var cat = self.index[tmp.feed_id];
						if(cat){
							cat.unreadCount(tmp.unread);
						}
					}
				}
			}
			d.resolve();
		});
		return d.promise();
	}
}

// -------------------------
// ViewModel object
// -------------------------
function ViewModel(pref, api) {
	var self = this;
	var api = api;
	self.api = api;
	self.pref = pref;

	// Categories
	self.catManager = new CategoriesManager();
	self.cats = self.catManager.cats;
	self.selectedCat = self.catManager.selectedCat;

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

	// Login information
	self.username = ko.observable();
	self.password = ko.observable();
	self.loggedIn = ko.observable(false);
	
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
			self.catManager.updateCats();
		}
	}
	
	self.updateCategories = function(){
		/*var d = $.Deferred();
		api.getOrderedCategories().then(function(cats){
			if(cats.content.error){
				// Not logged in
				self.loggedIn(false);
			} else {
				self.cats(cats.content);
			}
			d.resolve();
		});
		return d.promise();*/
		self.catManager.updateCats();
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

// ----------
// Initialization
// ----------
$(function(){
	// Intantiating models
	pref = new PrefModel(pref_Feed, pref_ViewMode, pref_OrderBy, pref_FeedSort, global_ttrssUrl);
	api = new ApiDAO(pref);
	model = new ViewModel(pref, api);
	ko.applyBindings(model);
	
	// Screen mode bindings
	// We will have 2 interaction modes:
	// 1) Show both categories and news (big enough screens)
	// 2) Show either cats or news (small screens)
	// So, we bind to screen resize to make the changes required based on that
	$(window).resize(model.screenResize);
	$(window).on("orientationchange", model.screenResize);
	model.screenResize();	
	
	// Defining path URLs
	var sessionId = $.cookie('g2tt_sid');
	
	// Loads category list
	Path.map("#/").to(function(){
		if(sessionId) model.load();
	});
	
	// Shows the Header List for a specific cat
	Path.map("#/cat/:catId/").to(function(){
		if(sessionId) model.selectCat({"id": this.params['catId']});
	});
	
	// Shows the Header List, but tries to scroll to specific Header
	Path.map("#/cat/:catId/header/:headId").to(function(){
		var params = this.params;
		if(sessionId) {
			model.selectCat({"id": this.params['catId']}).then(function(){
				// Now, let's try to scroll to the header
				model.showHeader(params['headId']);
			});
		}
	});
	
	// Shows starred
	Path.map("#/starred").to(function(){
		if(sessionId) model.selectStarred();
	});
	
	Path.root("#/");
	Path.rescue(function(){alert('¿?')});
	Path.listen();
});

