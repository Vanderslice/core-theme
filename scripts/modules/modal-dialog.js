//A quick modular way to make a Bootstrap modal.
//Documentation from Bootstrap here:
// https://v4-alpha.getbootstrap.com/components/modal/

define(['modules/jquery-mozu', 'shim!vendor/bootstrap/js/modal[jquery=jQuery]'],
 function ($) {

   var instance;

   /*For this modal to function, you must pass it  an options object that has
   AT LEAST:
   -elementId: id of element to turn into a modal
   -AT LEAST ONE OF, for the sake of it having any content:
      - header
      - title
      - body 
   */

   function Modal(options){
     var header = options.header || null;
     //Appends to the end of the .modal-header div.
     var title = options.title || null;
     //Prepends a <h4> element in the .modal-header div.
     var body = options.body || "";
     //Fills the .modal-body div.
     var footer = options.footer || false;
     //If true, Prepends content in the .modal-footer div.
     var elementId = options.elementId || null;
     //**Necessary: id of element to turn into a modal.
     //This element should {% include 'modules/common/modal-dialog' %},
     //or an element that extends the above template,
     //or the creator should be familiar with the components of a bootstrap modal.
     //It should also have the class "modal" for css purposes
     var hasXButton = options.hasXButton || true;
     //Puts an x button in the top right corner that will close the dialog.
     var hasCloseButton = options.hasCloseButton || false;
     //Puts a 'Close' butotn in the bottom right corner that will close the dialog.
     var scroll = options.scroll || 'default';
     /*
     Bootstrap modals, by default, steal control of the page's scroll bar. This means that if your content
     goes past the height of the page, it'll be scrollable and it'll probably be fine.
     If you want to limit the height of your modal and have a scroll bar on the dialog itself,
     your best bet is probably just to include it manually in the body. If you'd prefer,
     you can use this scroll option - set it to true to use it, but know that for it to
     work you also need to set the bodyHeight option.
     */
     var width = options.width || 'default';
     //pretty straightforward - limits the width of the element.
     //if default, the width will be 598px.
     //Regardless, the width will extend to 100% if the viewport is more narrow
     //than 768px.
     var bodyHeight = options.bodyHeight || 'default';
     //We don't have a way to set the height of the entire modal element, but you can
     //define the height of the body for scroll purposes here.
     //By default, the body will match to fit the contents.
     //
    var theElement = $('#'+elementId);


    if(theElement.length){
      theElement.modal({
            keyboard: false
      });
      theElement.modal('hide');
    }

     if(!elementId || (!header && !title && !body)){
       //return an error
     } else {
      

       ////////////////
       //***HEADER***//
       ////////////////


       if (title){
         //put title in modal-title h4
         theElement.find('.modal-header').html("<h3 class='modal-title'>"+title+"</h4>");
       }

       if (header){
         theElement.find('.modal-header').append("</br>"+header);
         //if header option has been set, append after title
       }

       if (hasXButton){
         //prepend xButton to header
         var $xButton = $("<button>", {"type": "button", "class": "close", "aria-hidden": "true" });
         $xButton.html('&times;');

         $xButton.on('click', function(){
           theElement.modal('hide');
         });

         theElement.find('.modal-header').prepend($xButton);
       }

       if (!title && !header && !hasXButton){
         //if title, header, and hasXButton are all unset, we don't want a header at all.
         theElement.find('.modal-header').hide();
       }

       //////////////
       //***BODY***//
       //////////////

       theElement.find('.modal-body').text(body);

       if (scroll != 'default'){
         theElement.find('.modal-body').css('overflow', 'scroll');
       }

       ////////////////
       //***FOOTER***//
       ////////////////

       if (footer){
         theElement.find('.modal-footer').html(footer);
       } else {
         theElement.find('.modal-footer').hide();
       }

       if (hasCloseButton){
         var $closeButton = $("<button>", {"type": "button", "class": "mz-button", "aria-hidden": "true" });
         $closeButton.text("Close");
         $closeButton.on('click', function(){
           theElement.modal('hide');
         });

         theElement.find('.modal-footer').append($closeButton);
       }


       ////////////////
       //***GENERAL***//
       ////////////////

       if (width!=="default"){
         theElement.find('.modal-dialog').width(width);
       }

       if (bodyHeight!=="default"){
         theElement.find('.modal-body').height(bodyHeight);
       }


       //RETURN:

      

   }
    return {
       show: function(){
         theElement.modal('show');
       },
       hide: function(){
         theElement.modal('hide');
       }
     };
 }


   return {
    init: function(options) {
      return Modal(options);
    }
  };
 });