var Controller = function(api, pref){
	var self = this;
	self.model;
	self.categories = [];
	
	// --------------
	// Event Handlers
	// --------------
	
	self.onTest = function(){
		self.loadCatTree();
	}
	
	self.onLogin = function(){
		self.isLoggedIn().done(function(isLoggedIn){
			if(!isLoggedIn){
				self.login().done(self.initMethod);
			} else {
				self.initMethod();
			}
		})
	}
	
	self.onRefresh = function(){
	}
	
	self.onSelectCat = function(cat){
	}
	
	self.onSelectFeed = function(feed){
	}
	
	self.onExpandCat = function(cat){
	}
	
	self.onStarHeader = function(h){
	}
	
	self.onCatchup = function(h){
	}
	
	self.onMore = function(h){
	}
	
	self.onLess = function(h){
	}
	
	self.onMarkAsRead = function(){
	}
	
	self.onLoadStarred = function(){
	}
	
	// -------
	// Logic
	// -------
	// Method to be called after login
	// Change this method to execute a different action on login
	self.initMethod = function(){
		self.loadDefault();
	};
	
	self.isLoggedIn = function(){
		var d = $.Deferred();
		var sessionId = $.cookie('slim_sid');
		if(sessionId){
			api.isLoggedIn(sessionId).done(function(isLoggedIn){
				d.resolve(isLoggedIn);
			});
		} else {
			d.resolve(false);
		}
		return d.promise();
	}
	
	self.login = function() {
		var d = $.Deferred();
		var m = self.model;
		
		var p = api.login(self.model.username(), self.model.password());
		p.then(function(response) {
			if (response['content'].error == 'LOGIN_ERROR') {
				window.alert("Username and/or Password were incorrect!");
				d.fail();
			} else if (response['content'].error == 'API_DISABLED') {
				window.alert("The API Setting is disabled. Login on the desktop version and enable API in the Preferences.");
				d.fail();
			} else {
				$.cookie('slim_sid', response['content'].session_id, {
					expires: 7
				});
				
				m.loggedIn(true);
				d.resolve();
			}			
		}).fail(function(data, e) {
			alert('Login failed: ' + e);
			if(self.debugMode()) alert('Data: ' + data);
			d.fail();
		});
		
		return d.promise();
	}
	
	self.loadDefault = function(){
		var catPromise = self.loadCatTree();
		var headPromise = self.loadHeadlines();
		
		$.when(catsPromise, headlinesPromise).done(function(cats, heads){
			// Assigning data to model
			var m = self.model;
			m.cats(cats);
			m.heads(heads.content);
			
			// Selecting the default cat
			m.selectedCat(self.getCat(pref.defaultFeed));
		});
	}
	
	self.loadCatTree = function(){
		var d = $.Deferred();
		
		// Let's load the cats
		catsPromise = api.getFeedTree();
		
		catsPromise.done(function(cats){
			var ret = [];
			if(cats.content.error){
				// Not logged in
				self.model.loggedIn(false);
				return;
			} else {
				// Let's parse the data
				// and store it as a flat map in self.categories
				for(var i = 0; i < cats.content.categories.items.length; i++){
					var c = cats.content.categories.items[i];
					c = self.formatCat(c);
					self.categories[c().id] = c;
					ret.push(c);
					
					for(var j = 0; j < c().items.length; j++){
						var f = c().items[j];
						f = self.formatFeed(f);
						self.categories[f().id] = f;
						c().feeds.push(f);
					}
				}
			}
			
			d.resolve(ret);
		});
		
		return d.promise();
	}
	
	self.updateCounts = function(){
		
	}
	
	self.formatCat = function(c){
		c.collapsed = ko.observable(true);
		c.unread = ko.observable(c.unread);
		c.feeds = ko.observableArray();
		return ko.observable(c);
	}
	
	self.formatFeed = function(f){
		f.unread = ko.observable(f.unread);
		return ko.observable(f);
	}
	
	self.loadHeadlines = function(cat){
		var d = $.Deferred();
		return d.promise();
	}
	
	self.updateCounters = function(){
		var d = $.Deferred();
		return d.promise();
	}
	
	// ---------
	// Utility methods
	// ---------
	self.getCat = function(catId){
		var prefix = 'CAT:';
		if(catId > -1){
			prefix = 'FEED:';
		}
		return self.categories[prefix + catId];
	}
}

// ----------
// Initialization
// ----------
$(function(){
	// Intantiating models
	api = new ApiDAO(pref);
	
	controller = new Controller(api, pref);
	eventHub = new EventHub();
	eventHub.subscribe(controller);
	
	model = new ViewModel(eventHub, pref, api);
	controller.model = model;
	
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
	var sessionId = $.cookie('slim_sid');
	
	// Loads category list
	Path.map("#/").to(function(){
		controller.onLogin();
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

