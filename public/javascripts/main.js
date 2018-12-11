var ShareDB = require('sharedb/lib/client');
var Quill = require('quill');
var ReconnectingWebSocket = require('reconnectingwebsocket');
var cursors = require('./cursors' );
var utils = require('./utils');
const uuidv1 = require('uuid/v1');
var $ = require('jquery');
require('events').EventEmitter.prototype._maxListeners = 100;
import QuillCursors from 'quill-cursors/src/cursors';

ShareDB.types.register(require('rich-text').type);

Quill.register('modules/cursors', QuillCursors);

var shareDBSocket = new ReconnectingWebSocket(((location.protocol === 'https:') ? 'wss' : 'ws') + '://' + window.location.host + '/sharedb');

var shareDBConnection = new ShareDB.Connection(shareDBSocket);

var user = null;
var docIsOpen = false;
var postIDArray = [];
var theDoc = null;
var newDocTitle = 'Untitled';

/*
  INIT rich text editor and link to DOM
*/

var quill = window.quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    cursors: {
      autoRegisterListener: false
    },
    history: {
      userOnly: true
    }
  },
  scrollingContainer: ".editor-container",
  readOnly: true
});

var cursorsModule = quill.getModule('cursors');
//hide text editor until user logs in.
//document.getElementById('editor').style.display = 'none';

window.cursors = cursors;

var usernameInputEl = document.getElementById('username-input');
var usersListEl = document.getElementById('users-list');


function updateUserList() {
  // Wipe the slate clean
  usersListEl.innerHTML = null;

  cursors.connections.forEach(function(connection) {
    var userItemEl = document.createElement('li');
    var userNameEl = document.createElement('div');
    var userDataEl = document.createElement('div');

    userNameEl.innerHTML = '<strong>' + (connection.name || '(Waiting for username...)') + '</strong>';
    userNameEl.classList.add('user-name');

    if (connection.id == cursors.localConnection.id)
      userNameEl.innerHTML += ' (You)';

    if (connection.range) {

      if (connection.id == cursors.localConnection.id)
        connection.range = quill.getSelection();

      userDataEl.innerHTML = [
        '<div class="user-data">',
        '  <div>Index: ' + connection.range.index + '</div>',
        '  <div>Length: ' + connection.range.length + '</div>',
        '</div>'
      ].join('');
    } else
      userDataEl.innerHTML = '(Not focusing on editor.)';


    userItemEl.appendChild(userNameEl);
    userItemEl.appendChild(userDataEl);

    userItemEl.style.backgroundColor = connection.color;
    usersListEl.appendChild(userItemEl);
  });
}

//init loginbar
usernameInputEl.value = '';
usernameInputEl.focus();
usernameInputEl.select();

var postListEl = document.getElementById('post-list');

function updatePostList() {
  //Wipe the slate clean
  postListEl.innerHTML = null;
  var getArchivedByUser = {'ops.author' : user};
  var query = shareDBConnection.createFetchQuery('documents', getArchivedByUser, {}, false);
  query.on('ready', function() {
    //each post is a shareDB.Doc instance
    //console.log(query.results);
    let posts = query.results;
    let i = 0;
    posts.forEach(function(post) {

      var contentPreview = '';
      //for(var insert in post.data.ops[0].content) {
       //contentPreview += insert;     
      //}
      postIDArray[i] = post.id;
      //let previewContent = post.data.ops[0].content[0]; //.values().join('');
      //const trimContent = previewContent.substring(0, indexOf('.')) + '.';
      var postItemEl = document.createElement('li');
      var postContentEl = document.createElement('div');          
      postContentEl.innerHTML = [
        '<div class="post-preview">',
        '  <div><strong>' + post.data.ops[0].title + '</strong></div>',
        '  <br></br>',
        '</div>'
      ].join('');
      postItemEl.appendChild(postContentEl);
      //maybe doesn't even work to pass the index of the thing being clicked.
      //makes a memory leak of some kind.
      //too many event listeners being registered.
      //does the event listener go out of scope?
      postItemEl.addEventListener('click', postListClick);
      //$('#post-list').on('click', 'li', postListClick());
      //get the document element that was clicked then take .index() of it.
      //using queryselector() to get the 
      postListEl.appendChild(postItemEl);
      i++;
    });
  });
}

//ONLOGIN
document.getElementById('connect-btn').onclick = function(event) {
  if(usernameInputEl.value == '') {
    alert("Please Enter Your Name");
    return false;
  }
  user = usernameInputEl.value;
  updatePostList();
  cursors.localConnection.name = usernameInputEl.value;
  user = usernameInputEl.value;
  cursors.update();
  quill.enable();
  document.getElementById('connect-panel').style.display = 'none';
  document.getElementById('users-panel').style.display = 'block';
  event.preventDefault();
  return false;
};

/*
  Query DB for... doc content to populate the quill with. Yes.
  Need an onclick event that specifies which doc to put in the editor.

  get a sharedb doc instance from the collection documents, with the id foobar.
  so we'll want to make this a uuid and associate it to the currently logged in user?
  or is it the uuid of the post in question?
*/

var titleInputEl = document.getElementById('title-input');
//New Blank Doc
document.getElementById('newpost').onclick = function() {
  if(docIsOpen) {
    theDoc.destroy();
  }
  //init a new doc
  theDoc = shareDBConnection.get('documents', uuidv1());
  newDocTitle = titleInputEl.value;
  //connect sockets for cursors and track operations on the doc.
  joinDoc(theDoc);
  updatePostList();
  event.preventDefault();
  return false;
};

var postListClick = function() {
  if(docIsOpen) {
    theDoc.destroy();
  }
  //because theDoc is undefined? Yes. Must be it.
  theDoc = shareDBConnection.get('documents', postIDArray[$(this).index()]);
  console.log('just ran GET');
  console.log(theDoc.data.author);
  console.log(theDoc.data.title);
  console.log(theDoc.data.content);
  //all that stuff is undefined, but the doc isnt.
  //The doc.data is a delta object.
  console.log(theDoc.data);
  joinDoc(theDoc);
  event.preventDefault();
  return false;
};
//need an onclick event for any of the li items, I don't want to have to
//write an onclick event for every single one.

/*
 nest this in an onclick event on the list of posts.
 call doc.subscribe and define a callback on it as well. waow.
 populate editor, keep editor synced with active users, add event listeners.
 sync cursors
 call doc.delete 
*/

function joinDoc(doc) {
  doc.subscribe(function(err) {
    if (err) throw err;
    //if no doc with associated id... create a new one
    //else open the old one.
    //so actually writing is finished, we just need to add a new doc workflow. 
    if (!doc.type) {
      doc.create([
      { 
        author: user,
        title: newDocTitle,
        content: [{
          insert: '\n'
        }]
      }], 'rich-text');
      console.log('created a fresh doc to join');
    }
      
    // update editor contents
    quill.setContents(doc.data.content);
    // local -> server
    quill.on('text-change', function(delta, oldDelta, source) {
      if (source == 'user') {

        // Check if it's a formatting-only delta
        var formattingDelta = delta.reduce(function (check, op) {
          return (op.insert || op.delete) ? false : check;
        }, true);

        // If it's not a formatting-only delta, collapse local selection
        if (
          !formattingDelta &&
          cursors.localConnection.range &&
          cursors.localConnection.range.length
        ) {
          cursors.localConnection.range.index += cursors.localConnection.range.length;
          cursors.localConnection.range.length = 0;
          cursors.update();
        }

        doc.submitOp(delta, {
          source: quill
        }, function(err) {
          if (err)
            console.error('Submit OP returned an error:', err);
        });

        updateUserList();
      }
    });

    cursorsModule.registerTextChangeListener();

    // server -> local
    doc.on('op', function(op, source) {
      if (source !== quill) {
        quill.updateContents(op);
        updateUserList();
      }
    });

    //
    function sendCursorData(range) {
      cursors.localConnection.range = range;
      cursors.update();
    }

    //
    var debouncedSendCursorData = utils.debounce(function() {
      var range = quill.getSelection();

      if (range) {
        console.log('[cursors] Stopped typing, sending a cursor update/refresh.');
        sendCursorData(range);
      }
    }, 1500);

    doc.on('nothing pending', debouncedSendCursorData);

    function updateCursors(source) {
      var activeConnections = {},
        updateAll = Object.keys(cursorsModule.cursors).length == 0;

      cursors.connections.forEach(function(connection) {
        if (connection.id != cursors.localConnection.id) {

          // Update cursor that sent the update, source (or update all if we're initting)
          if ((connection.id == source.id || updateAll) && connection.range) {
            cursorsModule.setCursor(
              connection.id,
              connection.range,
              connection.name,
              connection.color
            );
          }

          // Add to active connections hashtable
          activeConnections[connection.id] = connection;
        }
      });

      // Clear 'disconnected' cursors
      Object.keys(cursorsModule.cursors).forEach(function(cursorId) {
        if (!activeConnections[cursorId]) {
          cursorsModule.removeCursor(cursorId);
        }
      });
    }

    quill.on('selection-change', function(range, oldRange, source) {
      sendCursorData(range);
    });

    document.addEventListener('cursors-update', function(e) {
      // Handle Removed Connections
      e.detail.removedConnections.forEach(function(connection) {
        if (cursorsModule.cursors[connection.id])
          cursorsModule.removeCursor(connection.id);
      });

      updateCursors(e.detail.source);
      updateUserList();
    });

    updateCursors(cursors.localConnection);
  });
}

// DEBUG

var sharedbSocketStateEl = document.getElementById('sharedb-socket-state');
var sharedbSocketIndicatorEl = document.getElementById('sharedb-socket-indicator');

shareDBConnection.on('state', function(state, reason) {
  var indicatorColor;
  console.log('[sharedb] New connection state: ' + state + ' Reason: ' + reason);

  sharedbSocketStateEl.innerHTML = state.toString();

  switch (state.toString()) {
    case 'connecting':
      indicatorColor = 'silver';
      break;
    case 'connected':
      indicatorColor = 'lime';
      break;
    case 'disconnected':
    case 'closed':
    case 'stopped':
      indicatorColor = 'red';
      break;
  }

  sharedbSocketIndicatorEl.style.backgroundColor = indicatorColor;
});
