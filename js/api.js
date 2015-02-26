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
			timeout: 5 * 1000,
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
	
	self.isLoggedIn = function(sessionId){
		var d = $.Deferred();
		var data = {
			'op': 'isLoggedIn'
		};
		self.apiCall(data).done(function(r){
			d.resolve(d.status);
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
	
	self.getFeedTree = function(){
		var data = new Object();
		data.op = "getFeedTree";
		data.include_empty = true;
		return self.apiCall(data);
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
		data.limit = pref.maxHeadlines;
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