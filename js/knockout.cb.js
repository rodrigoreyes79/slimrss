ko.bindingHandlers.eh = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
        // Make a modified binding context, with a extra properties, and apply it to descendant elements
        var innerBindingContext = bindingContext.extend({'$eh': valueAccessor});
        ko.applyBindingsToDescendants(innerBindingContext, element);
 
        // Also tell KO *not* to bind the descendants itself, otherwise they will be bound twice
        return { controlsDescendantBindings: true };
    }
}

ko.bindingHandlers.ehclick = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
        // First get the latest data that we're bound to
        var wEvent = valueAccessor();
 
        // Next, whether or not the supplied model property is observable, get its current value
        var event = ko.unwrap(wEvent);
 
        // Let's get the eventHandler
        var eh = bindingContext['$eh']();
		var data = bindingContext['$data'];
 
		// Let's make some validations
        if(eh == undefined){
			console.log('Undefined event hub');
			return;
		}
		
		$(element).click(function(){
			eh.publish(event, [data]);
		})
    }
};