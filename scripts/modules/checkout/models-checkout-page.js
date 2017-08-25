define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'modules/models-customer',
    'modules/models-address',
    'modules/models-paymentmethods',
    'hyprlivecontext',
    'modules/models-orders',
    'modules/checkout/models-checkout-step',
    'modules/checkout/models-shipping-step',
    'modules/checkout/models-shipping-destinations',
    'modules/checkout/models-shipping-methods',
    'modules/checkout/models-payment',
    'modules/checkout/models-contact-dialog'
],
    function ($, _, Hypr, Backbone, api, CustomerModels, AddressModels, PaymentMethods, 
        HyprLiveContext, OrderModels, CheckoutStep, ShippingStep, 
        ShippingDestinationModels, ShippingInfo, BillingInfo, ContactDialogModels) {

    var checkoutPageValidation = {
            'emailAddress': {
                fn: function (value) {
                    if (this.attributes.createAccount && (!value || !value.match(Backbone.Validation.patterns.email))) return Hypr.getLabel('emailMissing');
                }
            },
            'password': {
                fn: function (value) {
                    if (this.attributes.createAccount && !value) return Hypr.getLabel('passwordMissing');
                }
            },
            'confirmPassword': {
                fn: function (value) {
                    if (this.attributes.createAccount && value !== this.get('password')) return Hypr.getLabel('passwordsDoNotMatch');
                }
            }
        };

        if (Hypr.getThemeSetting('requireCheckoutAgreeToTerms')) {
            checkoutPageValidation.agreeToTerms = {
                acceptance: true,
                msg: Hypr.getLabel('didNotAgreeToTerms')
            };
        }

        var storefrontOrderAttributes = require.mozuData('pagecontext').storefrontOrderAttributes;
        if(storefrontOrderAttributes && storefrontOrderAttributes.length > 0){

            var requiredAttributes = _.filter(storefrontOrderAttributes, 
                function(attr) { return attr.isRequired && attr.isVisible && attr.valueType !== 'AdminEntered' ;  });
            requiredAttributes.forEach(function(attr) {
                if(attr.isRequired) {

                    checkoutPageValidation['orderAttribute-' + attr.attributeFQN] = 
                    {
                        required: true,
                        msg: attr.content.value + " " + Hypr.getLabel('missing')
                    };
                }
            }, this);
        }

var CheckoutOrder = OrderModels.Order.extend({
    helpers : ['selectableDestinations', 'isOriginalCartItem'],
    validation : {
        destinationId : {
            required: true,
            msg: Hypr.getLabel("shippingDestinationRequiredError")
        }
    },
    initialize: function(){
        
    },
    getCheckout : function(){
        return this.collection.parent;
    },
    getDestinations : function(){
        return this.getCheckout().get('destinations');
    },
    selectableDestinations : function(){
        var selectable = [];
       this.getCheckout().get('destinations').each(function(destination){
            if(!destination.get('isGiftCardDestination')){
                selectable.push(destination.toJSON());
            }
        });
        return selectable;   
    },
    isOriginalCartItem : function(){
        var self = this;
        var originalCartItem = self.collection.findWhere({originalCartItemId: self.get('originalCartItemId')});
        return originalCartItem.id == self.get('id');
    },
    addNewContact: function(){
        
        this.getCheckout().get('dialogContact').resetDestinationContact();
        this.getCheckout().get('dialogContact').unset('id');

        this.getCheckout().get('dialogContact').trigger('openDialog');
    },
    editContact: function(destinationId){
        var destination = this.getDestinations().findWhere({'id': destinationId});
        
        if(destination){
            var destCopy = destination.toJSON();
            destCopy = new ShippingDestinationModels.ShippingDestination(destCopy);
            //destCopy.set('destinationContact', new CustomerModels.Contact(destCopy.get('destinationContact')));
            //this.getCheckout().get('dialogContact').get("destinationContact").clear();
            this.getCheckout().set('dialogContact', destCopy);
            this.getCheckout().get('dialogContact').set("destinationContact", new CustomerModels.Contact(destCopy.get('destinationContact').toJSON()));
            this.getCheckout().get('dialogContact').trigger('openDialog');
        }

    },
    updateOrderItemDestination: function(destinationId, customerContactId){
        var self = this;
        self.isLoading(true);        
        if(!destinationId) {
            var destination = self.getCheckout().get('destinations').findWhere({customerContactId: customerContactId});
            if(destination){
                return destination.saveDestinationAsync().then(function(data){
                    return self.getCheckout().apiUpdateCheckoutItemDestination({
                        id: self.getCheckout().get('id'), 
                        itemId: self.get('id'), 
                        destinationId: data.data.id
                    }).ensure(function(){
                        self.isLoading(false);
                    });
                });
            }
        }
        self.set('destinationId', destinationId);
        return self.getCheckout().apiUpdateCheckoutItemDestination({
            id: self.getCheckout().get('id'), 
            itemId: self.get('id'), 
            destinationId: destinationId
        }).ensure(function(){
            self.isLoading(false);
        });
    },
    splitCheckoutItem : function(){
        var self = this;
        var me = this;
        this.getCheckout().get('shippingStep').splitCheckoutItem(self.get('id'), 1);
    }
});


var CheckoutGrouping = Backbone.MozuModel.extend({
    helpers: ['groupingItemInfo', 'groupingDestinationInfo', 'groupingShippingMethods', 'loadingShippingMethods'],
    validation : {
        shippingMethodCode : {
            fn: "validateShippingCode",
            msg: Hypr.getLabel("shippingMethodRequiredError")
        }
    },
    validateShippingCode: function(value, attr) {
        if (!this.get('shippingMethodCode') && this.get('fulfillmentMethod') == "Ship") return this.validation[attr.split('.').pop()].msg;
    },
    getCheckout : function(){
        return this.collection.parent;
    },
    groupingItemInfo : function(){
        var self = this,
            orderItems = [];

        _.forEach(this.get('orderItemIds'), function(itemId, idx){
            var item = self.getCheckout().get('items').findWhere({id: itemId});
            if(item) orderItems.push(item.toJSON());
        });

        return orderItems;
    },
    groupingDestinationInfo : function(){
       var self = this,
       destinationInfo = self.getCheckout().get('destinations').findWhere({id:this.get('destinationId')});
       return (destinationInfo) ? destinationInfo.toJSON() : {};
    },
    groupingShippingMethods : function(){
        var self = this,
        shippingMethod = self.getCheckout().get('shippingMethods').findWhere({groupingId:this.get('id')});
        return (shippingMethod) ? shippingMethod.toJSON().shippingRates : [];
    },
    loadingShippingMethods : function(){
        this.getCheckout().get('shippingMethods').get('isLoading');
    }
});

var CheckoutPage = Backbone.MozuModel.extend({
            mozuType: 'checkout',
            handlesMessages: true,
            relations: {
                items : Backbone.Collection.extend({
                    model : CheckoutOrder,
                }),
                groupings : Backbone.Collection.extend({
                    model : CheckoutGrouping 
                }),
                billingInfo: BillingInfo,
                shopperNotes: Backbone.MozuModel.extend(),
                customer: CustomerModels.Customer,
                destinations : ShippingDestinationModels.ShippingDestinations,
                shippingStep: ShippingStep,
                shippingInfo: ShippingInfo,
                dialogContact: ContactDialogModels,
                shippingMethods : Backbone.Collection.extend()
            },
            validation: checkoutPageValidation,
            dataTypes: {
                createAccount: Backbone.MozuModel.DataTypes.Boolean,
                acceptsMarketing: Backbone.MozuModel.DataTypes.Boolean,
                amountRemainingForPayment: Backbone.MozuModel.DataTypes.Float,
                isMultiShipMode : Backbone.MozuModel.DataTypes.Boolean
            },
            defaults: {
                "isMultiShipMode" : false
            },
            setMultiShipMode : function(){
            var directShipItems = this.get('items').where({fulfillmentMethod: "Ship"});
            var destinationCount = _.countBy(directShipItems, function(item){
                    return item.get('destinationId');
                });

            return (_.size(destinationCount) > 1) ? this.set('isMultiShipMode', true) : this.set('isMultiShipMode', false);
            },
            addCustomerContacts : function(){
                var self =this;
                var contacts = self.get('customer').get('contacts');

                if(contacts.length){
                    contacts.each(function(contact, key){
                        if(contact.contactTypeHelpers().isShipping()){
                            if(!self.get('destinations').hasDestination(contact)){
                                self.get('destinations').newDestination(contact, true);
                            }
                        }
                    });
                    self.get('destinations').trigger('destinationsUpdate');
                }
            },
            initialize: function (data) {

                var self = this,
                    user = require.mozuData('user');
                    //self.get('shippingStep').initSet();
                    
                 self.addCustomerContacts();
                _.defer(function() {
                    self.setMultiShipMode();
                    

                    var latestPayment = self.apiModel.getCurrentPayment(),
                        activePayments = self.apiModel.getActivePayments(),
                        //fulfillmentInfo = self.get('fulfillmentInfo'),
                        shippingStep = self.get('shippingStep'),
                        shippingInfo = self.get('shippingInfo'),
                        billingInfo = self.get('billingInfo'),
                        steps = [shippingStep, shippingInfo, billingInfo],
                        paymentWorkflow = latestPayment && latestPayment.paymentWorkflow,
                        visaCheckoutPayment = activePayments && _.findWhere(activePayments, { paymentWorkflow: 'VisaCheckout' }),
                        allStepsComplete = function () {
                            return _.reduce(steps, function(m, i) { return m + i.stepStatus(); }, '') === 'completecompletecomplete';
                        },
                        isReady = allStepsComplete();

                    //Visa checkout payments can be added to order without UIs knowledge. This evaluates and voids the required payments.
                    if (visaCheckoutPayment) {
                        _.each(_.filter(self.apiModel.getActivePayments(), function (payment) {
                            return payment.paymentType !== 'StoreCredit' && payment.paymentType !== 'GiftCard' && payment.paymentWorkflow != 'VisaCheckout';
                        }), function (payment) {
                            self.apiVoidPayment(payment.id);
                        });
                        paymentWorkflow = visaCheckoutPayment.paymentWorkflow;
                        billingInfo.unset('billingContact');
                        billingInfo.set('card', visaCheckoutPayment.billingInfo.card);
                        billingInfo.set('billingContact', visaCheckoutPayment.billingInfo.billingContact, { silent:true });
                     }

                    if (paymentWorkflow) {
                        billingInfo.set('paymentWorkflow', paymentWorkflow);
                        billingInfo.get('card').set({
                            isCvvOptional: Hypr.getThemeSetting('isCvvSuppressed'),
                            paymentWorkflow: paymentWorkflow
                        });
                        billingInfo.trigger('stepstatuschange'); // trigger a rerender
                    }

                    self.isReady(isReady);

                    _.each(steps, function(step) {
                        self.listenTo(step, 'stepstatuschange', function() {
                            _.defer(function() {
                                self.isReady(allStepsComplete());
                            });
                        });
                    });

                    if (!self.get('requiresFulfillmentInfo')) {
                        self.validation = _.pick(self.constructor.prototype.validation, _.filter(_.keys(self.constructor.prototype.validation), function(k) { return k.indexOf('fulfillment') === -1; }));
                    }

                    self.get('billingInfo.billingContact').on('change:email', function(model, newVal) {
                        self.set('email', newVal);
                    });

                    var billingEmail = billingInfo.get('billingContact.email');
                    if (!billingEmail && user.email) billingInfo.set('billingContact.email', user.email);

                    self.applyAttributes();

                });
                if (user.isAuthenticated) {
                    this.set('customer', { id: user.accountId });
                }
                // preloaded JSON has this as null if it's unset, which defeats the defaults collection in backbone
                if (data.acceptsMarketing === null) {
                    self.set('acceptsMarketing', true);
                }

                _.bindAll(this, 'update', 'onCheckoutSuccess', 'onCheckoutError', 'addNewCustomer', 'saveCustomerCard', 'apiCheckout', 
                    'addDigitalCreditToCustomerAccount', 'saveCustomerContacts');

            },
            getCustomerInfo : function(){
                return this.get('customer');
            },
            applyAttributes: function() {
                var storefrontOrderAttributes = require.mozuData('pagecontext').storefrontOrderAttributes;
                if(storefrontOrderAttributes && storefrontOrderAttributes.length > 0) {
                    this.set('orderAttributes', storefrontOrderAttributes);
                }
            },

            processDigitalWallet: function(digitalWalletType, payment) {
                var me = this;
                me.runForAllSteps(function() {
                    this.isLoading(true);
                });
                me.trigger('beforerefresh');
                // void active payments; if there are none then the promise will resolve immediately
                return api.all.apply(api, _.map(_.filter(me.apiModel.getActivePayments(), function(payment) {
                    return payment.paymentType !== 'StoreCredit' && payment.paymentType !== 'GiftCard';
                }), function(payment) {
                    return me.apiVoidPayment(payment.id);
                })).then(function() {
                    return me.apiProcessDigitalWallet({
                        digitalWalletData: JSON.stringify(payment)
                    }).then(function () {
                        me.updateVisaCheckoutBillingInfo();
                        me.runForAllSteps(function() {
                            this.trigger('sync');
                            this.isLoading(false);
                        });
                        me.updateShippingInfo();
                    });
                });
            },
            updateShippingInfo: function() {
                var me = this;
                this.apiModel.getShippingMethods().then(function (methods) { 
                    //me.get('fulfillmentInfo').refreshShippingMethods(methods);
                });
            },
            updateVisaCheckoutBillingInfo: function() {
                //Update the billing info with visa checkout payment
                var billingInfo = this.get('billingInfo');
                var activePayments = this.apiModel.getActivePayments();
                var visaCheckoutPayment = activePayments && _.findWhere(activePayments, { paymentWorkflow: 'VisaCheckout' });
                if (visaCheckoutPayment) {
                    billingInfo.set('usingSavedCard', false);
                    billingInfo.unset('savedPaymentMethodId');
                    billingInfo.set('card', visaCheckoutPayment.billingInfo.card);
                    billingInfo.unset('billingContact');
                    billingInfo.set('billingContact', visaCheckoutPayment.billingInfo.billingContact, { silent:true });
                    billingInfo.set('paymentWorkflow', visaCheckoutPayment.paymentWorkflow);
                    billingInfo.set('paymentType', visaCheckoutPayment.paymentType);
                    this.refresh();
                }
            },
            addCoupon: function () {
                var me = this;
                var code = this.get('couponCode');
                var orderDiscounts = me.get('orderDiscounts');
                if (orderDiscounts && _.findWhere(orderDiscounts, { couponCode: code })) {
                    // to maintain promise api
                    var deferred = api.defer();
                    deferred.reject();
                    deferred.promise.otherwise(function () {
                        me.trigger('error', {
                            message: Hypr.getLabel('promoCodeAlreadyUsed', code)
                        });
                    });
                    return deferred.promise;
                }
                this.isLoading(true);
                return this.apiAddCoupon(this.get('couponCode')).then(function () {

                    me.get('billingInfo').trigger('sync');
                    me.set('couponCode', '');

                    var productDiscounts = _.flatten(_.pluck(me.get('items'), 'productDiscounts'));
                    var shippingDiscounts = _.flatten(_.pluck(_.flatten(_.pluck(me.get('items'), 'shippingDiscounts')), 'discount'));
                    var orderShippingDiscounts = _.flatten(_.pluck(me.get('shippingDiscounts'), 'discount'));

                    var allDiscounts = me.get('orderDiscounts').concat(productDiscounts).concat(shippingDiscounts).concat(orderShippingDiscounts);
                    var lowerCode = code.toLowerCase();

                    var matchesCode = function (d) {
                        // there are discounts that have no coupon code that we should not blow up on.
                        return (d.couponCode || "").toLowerCase() === lowerCode;
                    };

                    if (!allDiscounts || !_.find(allDiscounts, matchesCode))
                    {
                        me.trigger('error', {
                            message: Hypr.getLabel('promoCodeError', code)
                        });
                    }

                    else if (me.get('total') === 0) {
                        me.trigger('complete');
                    }
                    // only do this when there isn't a payment on the order...
                    me.get('billingInfo').updatePurchaseOrderAmount();
                    me.isLoading(false);
                });
            },
            onCheckoutSuccess: function () {
                this.isLoading(true);
                this.trigger('complete');
            },
            onCheckoutError: function (error) {
                var order = this,
                    errorHandled = false;
                order.isLoading(false);
                if (!error || !error.items || error.items.length === 0) {
                    error = {
                        items: [
                            {
                                message: error.message || Hypr.getLabel('unknownError')
                            }
                        ]
                    };
                }
                $.each(error.items, function (ix, errorItem) {
                    if (errorItem.name === 'ADD_CUSTOMER_FAILED' && errorItem.message.toLowerCase().indexOf('invalid parameter: password')) {
                        errorHandled = true;
                        order.trigger('passwordinvalid', errorItem.message.substring(errorItem.message.indexOf('Password')));
                    }
                    if (errorItem.errorCode === 'ADD_CUSTOMER_FAILED' && errorItem.message.toLowerCase().indexOf('invalid parameter: emailaddress')) {
                        errorHandled = true;
                        order.trigger('userexists', order.get('emailAddress'));
                    }
                });

                this.trigger('error', error);

                if (!errorHandled) order.messages.reset(error.items);
                order.isSubmitting = false;
                throw error;
            },
            addNewCustomer: function () {
                var self = this,
                billingInfo = this.get('billingInfo'),
                billingContact = billingInfo.get('billingContact'),
                email = this.get('emailAddress'),
                captureCustomer = function (customer) {
                    if (!customer || (customer.type !== 'customer' && customer.type !== 'login')) return;
                    var newCustomer;
                    if (customer.type === 'customer') newCustomer = customer.data;
                    if (customer.type === 'login') newCustomer = customer.data.customerAccount;
                    if (newCustomer && newCustomer.id) {
                        self.set('customer', newCustomer);
                        api.off('sync', captureCustomer);
                        api.off('spawn', captureCustomer);
                    }
                };
                api.on('sync', captureCustomer);
                api.on('spawn', captureCustomer);
                return this.apiAddNewCustomer({
                    account: {
                        emailAddress: email,
                        userName: email,
                        firstName: billingContact.get('firstName') || this.get('fulfillmentInfo.fulfillmentContact.firstName'),
                        lastName: billingContact.get('lastNameOrSurname') || this.get('fulfillmentInfo.fulfillmentContact.lastNameOrSurname'),
                        acceptsMarketing: self.get('acceptsMarketing')
                    },
                    password: this.get('password')
                }).then(function (customer) {
                    self.customerCreated = true;
                    return customer;
                }, function (error) {
                    self.customerCreated = false;
                    self.isSubmitting = false;
                    throw error;
                });
            },
            addApiCustomerContacts: function (){
                var self = this;
                var destinations = self.get('destinations');
                if(self.get('destinations').length) {
                    //Save some Contacts
                    
                }
            },
            saveCustomerContacts: function(){
                var customer = this.get('customer');
                var destinations = this.get('destinations');
                var contacts = [];
                var self = this;

                destinations.each(function(destination){
                    var contact = destination.get('destinationContact').toJSON();
                    contact.types =  [{
                        "name": "Shipping",
                        "isPrimary": (destination.get('destinationContact').contactTypeHelpers().isPrimaryShipping()) ? true : false
                    }];
                    contacts.push(contact);
                });

                var billingContact = customer.get('contacts').filter(function(contact){
                    return contact.contactTypeHelpers().isPrimaryBilling();        
                });

                if(!billingContact.length){
                    var contact = this.get('billingInfo').get('billingContact').toJSON();

                    contact.types =  [{
                        "name": "Billing",
                        "isPrimary": true 
                    }];
                    contacts.push(contact);
                }

                return customer.apiModel.updateCustomerContacts({id: customer.id, postdata:contacts}).then(function(contactResult) {
                      _.each(contactResult, function(contact){
                        var isPrimaryBilling = _.findWhere(contact, {contact: {types : { name: "Billing", "isPrimary": true }}});
                        if(isPrimaryBilling){
                            self.get('billingInfo').set('billingContact', contact);
                        }  
                      })  
                     return contactResult;
                });
                
            },
            saveCustomerCard: function () {
                var order = this,
                    customer = this.get('customer'), //new CustomerModels.EditableCustomer(this.get('customer').toJSON()),
                    billingInfo = this.get('billingInfo'),
                    isSameBillingShippingAddress = billingInfo.get('isSameBillingShippingAddress'),
                    isPrimaryAddress = this.isSavingNewCustomer(),
                    billingContact = billingInfo.get('billingContact').toJSON(),
                    card = billingInfo.get('card'),
                    doSaveCard = function() {
                        order.cardsSaved = order.cardsSaved || customer.get('cards').reduce(function(saved, card) {
                            saved[card.id] = true;
                            return saved;
                        }, {});
                        var method = order.cardsSaved[card.get('id') || card.get('paymentServiceCardId')] ? 'updateCard' : 'addCard';
                        card.set('contactId', billingContact.id);
                        return customer.apiModel[method](card.toJSON()).then(function(card) {
                            order.cardsSaved[card.data.id] = true;
                            return card;
                        });
                    };

                if(billingContact.id) {
                    return doSaveCard();
                }
            },
            getBillingContact: function () {
                return ;
            },
            // addShippingContact: function () {
            //     return this.addCustomerContact('fulfillmentInfo', 'fulfillmentContact', [{ name: 'Shipping' }]);
            // },
            // addShippingAndBillingContact: function () {
            //     return this.addCustomerContact('fulfillmentInfo', 'fulfillmentContact', [{ name: 'Shipping' }, { name: 'Billing' }]);
            // },
            // addCustomerContact: function (infoName, contactName, contactTypes) {
            //     var customer = this.get('customer'),
            //         contactInfo = this.get(infoName),
            //         process = [function () {
                      
            //             // Update contact if a valid contact ID exists
            //             if (orderContact.id && orderContact.id > 0) {
            //                 return customer.apiModel.updateContact(orderContact);
            //             } 

            //             if (orderContact.id === -1 || orderContact.id === 1 || orderContact.id === 'new') {
            //                 delete orderContact.id;
            //             }
            //             return customer.apiModel.addContact(orderContact).then(function(contactResult) {
            //                     orderContact.id = contactResult.data.id;
            //                     return contactResult;
            //                 });
            //         }];
            //     var contactInfoContactName = contactInfo.get(contactName);
            //     var customerContacts = customer.get('contacts');
                    
            //     if (!contactInfoContactName.get('accountId')) {
            //         contactInfoContactName.set('accountId', customer.id);
            //     }
            //     var orderContact = contactInfoContactName.toJSON();
            //     // if customer doesn't have a primary of any of the contact types we're setting, then set primary for those types
            //     if (!this.isSavingNewCustomer()) {
            //         process.unshift(function() {
            //             return customer.apiModel.getContacts().then(function(contacts) {
            //                 _.each(contactTypes, function(newType) {
            //                     var primaryExistsAlready = _.find(contacts.data.items, function(existingContact) {
            //                         return _.find(existingContact.types || [], function(existingContactType) {
            //                             return existingContactType.name === newType.name && existingContactType.isPrimary;
            //                         });
            //                     });
            //                     newType.isPrimary = !primaryExistsAlready;
            //                 });
            //             });
            //         });
            //     } else {
            //         _.each(contactTypes, function(type) {
            //             type.isPrimary = true;
            //         });
            //     }

            //     // handle email
            //     if (!orderContact.email) orderContact.email = this.get('emailAddress') || customer.get('emailAddress') || require.mozuData('user').email;

            //     var contactId = orderContact.contactId;
            //     if (contactId) orderContact.id = contactId;
            //     if (!orderContact.id || orderContact.id === -1 || orderContact.id === 1 || orderContact.id === 'new') {
            //         orderContact.types = contactTypes;
            //         return api.steps(process);
            //     } else {
            //         var customerContact = customerContacts.get(orderContact.id).toJSON();
            //         if (this.isContactModified(orderContact, customerContact)) {
            //             //keep the current types on edit
            //             orderContact.types = orderContact.types ? orderContact.types : customerContact.types;
            //             return api.steps(process);
            //         } else {
            //             var deferred = api.defer();
            //             deferred.resolve();
            //             return deferred.promise;
            //         }
            //     }
            // },
            // isContactModified: function(orderContact, customerContact) {
            //     var validContact = orderContact && customerContact && orderContact.id === customerContact.id;
            //     var addressChanged = validContact && !_.isEqual(orderContact.address, customerContact.address);
            //     //Note: Only home phone is used on the checkout page     
            //     var phoneChanged = validContact && orderContact.phoneNumbers.home &&
            //                         (!customerContact.phoneNumbers.home || orderContact.phoneNumbers.home !== customerContact.phoneNumbers.home);

            //     //Check whether any of the fields available in the contact UI on checkout page is modified
            //     return validContact &&
            //         (addressChanged || phoneChanged || 
            //         orderContact.email !== customerContact.email || orderContact.firstName !== customerContact.firstName ||
            //         orderContact.lastNameOrSurname !== customerContact.lastNameOrSurname);
            // },
            
            // setFulfillmentContactEmail: function () {
            //     var fulfillmentEmail = this.get('fulfillmentInfo.fulfillmentContact.email'),
            //         orderEmail = this.get('email');

            //     if (!fulfillmentEmail) {
            //         this.set('fulfillmentInfo.fulfillmentContact.email', orderEmail);
            //     }
            // },
            syncBillingAndCustomerEmail: function () {
                var billingEmail = this.get('billingInfo.billingContact.email'),
                    customerEmail = this.get('emailAddress') || require.mozuData('user').email;
                if (!customerEmail) {
                    this.set('emailAddress', billingEmail);
                }
                if (!billingEmail) {
                    this.set('billingInfo.billingContact.email', customerEmail);
                }
            },
            addDigitalCreditToCustomerAccount: function () {
                var billingInfo = this.get('billingInfo'),
                    customer = this.get('customer');

                var digitalCredits = billingInfo.getDigitalCreditsToAddToCustomerAccount();
                if (!digitalCredits)
                    return;
                return _.each(digitalCredits, function (cred) {
                    return customer.apiAddStoreCredit(cred.get('code'));
                });
            },
            isSavingNewCustomer: function() {
                return this.get('createAccount') && !this.customerCreated;
            },

            validateReviewCheckoutFields: function(){
                var validationResults = [];
                for (var field in checkoutPageValidation) {
                    if(checkoutPageValidation.hasOwnProperty(field)) {
                        var result = this.validate(field);
                        if(result) {
                            validationResults.push(result);
                        }
                    }
                }

                return validationResults.length > 0;
            },

            submit: function () {
                var checkout = this,
                    billingInfo = this.get('billingInfo'),
                    billingContact = billingInfo.get('billingContact'),
                    isSameBillingShippingAddress = billingInfo.get('isSameBillingShippingAddress'),
                    isSavingCreditCard = false,
                    isSavingNewCustomer = this.isSavingNewCustomer(),
                    isAuthenticated = require.mozuData('user').isAuthenticated,
                    nonStoreCreditTotal = billingInfo.nonStoreCreditTotal(),
                    requiresFulfillmentInfo = this.get('requiresFulfillmentInfo'),
                    requiresBillingInfo = nonStoreCreditTotal > 0,
                    process = [function() {
                        return checkout.apiUpdateCheckout({
                            ipAddress: checkout.get('ipAddress'),
                            shopperNotes: checkout.get('shopperNotes').toJSON()
                        });
                    }];

                var storefrontOrderAttributes = require.mozuData('pagecontext').storefrontOrderAttributes;
                if(storefrontOrderAttributes && storefrontOrderAttributes.length > 0) {
                    var updateAttrs = [];
                    storefrontOrderAttributes.forEach(function(attr){
                        var attrVal = checkout.get('orderAttribute-' + attr.attributeFQN);
                        if(attrVal) {
                            updateAttrs.push({
                                'fullyQualifiedName': attr.attributeFQN,
                                'values': [ attrVal ]
                            });
                        }
                    });

                    if(updateAttrs.length > 0){
                        process.push(function(){
                            return checkout.apiUpdateAttributes(updateAttrs);
                        }, function() {
                            return checkout.apiGet();
                        });
                    }
                }

                if (this.isSubmitting) return;

                this.isSubmitting = true;

                if (requiresBillingInfo && !billingContact.isValid()) {
                    // reconcile the empty address after we got back from paypal and possibly other situations.
                    // also happens with visacheckout ..
                    var billingInfoFromPayment = (this.apiModel.getCurrentPayment() || {}).billingInfo;
                    billingInfo.set(billingInfoFromPayment, { silent: true });
                }

                this.syncBillingAndCustomerEmail();
                //this.setFulfillmentContactEmail();

                // skip payment validation, if there are no payments, but run the attributes and accept terms validation.
                // if ((nonStoreCreditTotal > 0 && this.validate()) || this.validateReviewCheckoutFields()) {
                //     this.isSubmitting = false;
                //     return false;
                // } 

                this.isLoading(true);

                if (isSavingNewCustomer) {
                    process.unshift(this.addNewCustomer); 
                }

                //save contacts
                if (isAuthenticated || isSavingNewCustomer) {  
                    process.push(this.saveCustomerContacts);
                }

                var activePayments = this.apiModel.getActivePayments();
                var saveCreditCard = false;
                if (activePayments !== null && activePayments.length > 0) {
                     var creditCard = _.findWhere(activePayments, { paymentType: 'CreditCard' });
                     if (creditCard && creditCard.billingInfo && creditCard.billingInfo.card) {
                         saveCreditCard = creditCard.billingInfo.card.isCardInfoSaved;
                         billingInfo.set('card', creditCard.billingInfo.card);
                     }
                 }
                 if (saveCreditCard && (this.get('createAccount') || isAuthenticated)) {
                    isSavingCreditCard = true;
                    process.push(this.saveCustomerCard);
                    }

                if ((this.get('createAccount') || isAuthenticated) && billingInfo.getDigitalCreditsToAddToCustomerAccount().length > 0) {
                    process.push(this.addDigitalCreditToCustomerAccount);
                }

                
                
               
                process.push(/*this.finalPaymentReconcile, */this.apiCheckout);
                
                api.steps(process).then(this.onCheckoutSuccess, this.onCheckoutError);

            },
            update: function() {
                var j = this.toJSON();
                return this.apiModel.update(j);
            },
            refresh: function() {
              var me = this;
              this.trigger('beforerefresh');
              return this.apiGet().then(function() {
                me.trigger('refresh');
                // me.runForAllSteps(function() {
                //   this.trigger("sync");
                // });
              });
            },
            runForAllSteps: function(cb) {
                var me = this;
                _.each([
                       'shippingStep',
                       'shippingInfo',
                       'billingInfo'
                ], function(name) {
                    cb.call(me.get(name));
                });
            },
            isReady: function (val) {
                this.set('isReady', val);
            },
            toJSON: function (options) {
                var j = Backbone.MozuModel.prototype.toJSON.apply(this, arguments);
                if (!options || !options.helpers) {
                    delete j.password;
                    delete j.confirmPassword;
                }
                return j;
            }
        });
    return CheckoutPage;
});