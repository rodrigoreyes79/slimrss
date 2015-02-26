var EventHub = function(){
	var self = this;
	var eventHandlers = [];
	
	self.subscribe = function(eventHandler){
		eventHandlers.push(eventHandler);
	}
	
	self.publish = function(ev, data){
		var actionName = getActionName(ev);
		for(var i = 0; i < eventHandlers.length; i++){
			var action = eventHandlers[i][actionName];
			if(action != undefined && typeof action === "function"){
				action.apply(eventHandlers[i], data);
			}
		}
	}
	
	var getActionName = function(ev){
		return 'on' + ev.charAt(0).toUpperCase() + ev.slice(1);
	}
}