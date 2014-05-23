var http = require('http')
var when = require('promised-io/promise').when;
var taskFetcher = require('./lib/task_fetcher');
var taskModifier = require('./lib/task_modifier');
var fs = require('fs')
var path = require('path')
var mime = require('mime')
var statuses = require('httpstatuses')

var PORT = 2718

var taskList

function send404(response) {
  response.writeHead(statuses.notFound, {'Content-Type': 'text/plain'})
  response.write('Error 404: resource not found.')
  response.end()
}

function badRequest(response) {
  response.writeHead(statuses.badRequest, {'Content-Type': 'text/plain'})
  response.end()
}

function sendFile(response, filePath, fileContents) {
  response.writeHead(
    statuses.ok,
    {"content-type": mime.lookup(path.basename(filePath))}
  );
  response.end(fileContents)
}

function serveStatic(response, absPath) {
  fs.exists(absPath, function(exists) {
    if (exists) {
      fs.readFile(absPath, function(err, data) {
        if (err) {
          send404(response)
        } else {
          sendFile(response, absPath, data)
        }
      })
    } else {
      send404(response)
    }
  })
}

function serveTasks(res) {
  res.writeHead(
    statuses.ok,
    {"content-type": "application/json"}
  );
  res.end(JSON.stringify(taskList))
}

function reloadTasks() {
  when(taskFetcher.fetch(), function (tasks) {
    taskList = tasks
  }, function (err) {
    console.error(err)
  })
}

function handleRefresh(res) {
  reloadTasks()
  res.writeHead(statuses.accepted, {"content-type": "text/plain"})
  res.end()
}

var app = http.createServer( function (req, res) {
  var data
  if (/^\/tasks[\/.*]?/.test(req.url)) {
    serveTasks(res)
  } else if (/^\/done/.test(req.url)) {
    if(req.method === 'PUT') {
      data = ''
      req.on('data', function(chunk) { data += chunk.toString() })
      req.on('end', function() {
        try {
          var id = JSON.parse(data).uuid
          when(taskModifier.done(id),
               function () {
                 res.writeHead(statuses.noContent, {'content-type': 'application/json'})
                 res.end()
               },
               function (err) {
                 switch(err) {
                   case 'internal':
                     res.writeHead(statuses.internalServerError)
                     break
                   case 'bad uuid':
                     res.writeHead(statuses.badRequest)
                     break
                 }
                 res.writeHead({'content-type': 'text/plain'})
                 res.end()
               }
            )
        } catch (e) {
          badRequest(res)
        }
      })
    } else {
      badRequest(res)
    }
  } else if (/^\/delete/.test(req.url)) {
    if(req.method === 'PUT') {
      data = ''
      req.on('data', function(chunk) { data += chunk.toString() })
      req.on('end', function() {
        try {
          var id = JSON.parse(data).uuid
          when(taskModifier.delete(id),
            function() {
              res.writeHead(statuses.noContent, {'content-type': 'application/json'})
              res.end()
            },
            function (err) {
              switch(err) {
                case 'internal':
                  res.writeHead(statuses.internalServerError)
                  break
                case 'bad uuid':
                  res.writeHead(statuses.badRequest)
                  break
              }
              res.writeHead({'content-type': 'text/plain'})
              res.end()
            }
          )
        } catch (e) {
          badRequest(res)
        }
      })
    } else {
      badRequest()
    }
  } else if (/^\/modify/.test(req.url)) {
    if(req.method === 'PUT') {
      data = ''
      req.on('data', function(chunk) { data += chunk.toString() })
      req.on('end', function() {
        try {
          when(taskModifier.modify(JSON.parse(data)),
            function() {
              res.writeHead(statuses.noContent, {'content-type': 'application/json'})
              res.end()
            },
            function (err) {
              switch(err) {
                case 'malformed data':
                  res.writeHead(statuses.badRequest)
                  break
              }
              res.writeHead({'content-type': 'text/plain'})
              res.end()
            }
          )
        } catch (e) {
          badRequest(res)
        }
      })
    } else {
      badRequest()
    }
  } else if (/^\/annotate/.test(req.url)) {
    if(req.method === 'PUT') {
      data = ''
      req.on('data', function(chunk) { data += chunk.toString() })
      req.on('end', function() {
        try {
          var parsed = JSON.parse(data)
          when(taskModifier.annotate(parsed.uuid, parsed.annotation),
            function() {
              res.writeHead(statuses.noContent, {'content-type': 'application/json'})
              res.end()
            },
            function (err) {
              switch(err) {
                case 'malformed data':
                  res.writeHead(statuses.badRequest)
                  break
              }
              res.writeHead({'content-type': 'text/plain'})
              res.end()
            }
          )
        } catch (e) {
          badRequest(res)
        }
      })
    } else {
      badRequest()
    }
  } else if (/^\/add/.test(req.url)) {
    if(req.method === 'PUT') {
      data = ''
      req.on('data', function(chunk) { data += chunk.toString() })
      req.on('end', function() {
        try {
          var taskdata = JSON.parse(data)
          when(taskModifier.create(taskdata),
            function (value) {
              res.writeHead(statuses.created, {'content-type': 'applicaiton/json'})
              res.end(JSON.stringify(value))
            },
            function (err) {
              switch(err) {
                case 'internal':
                  res.writeHead(statuses.internalServerError)
                  break
                case 'malformed data':
                  res.writeHead(statuses.badRequest)
                  break
              }
              res.writeHead({'content-type': 'text/plain'})
              res.end()
            }
          )
        } catch (e) {
          badRequest(res)
        }
      })
    } else {
      badRequest(res)
    }
  } else if ('/refresh' === req.url) {
    handleRefresh(res)
  } else {
    var path
    if (req.url === '/') {
      path = 'public/index.html'
    } else {
      path = 'public' + req.url
    }
    serveStatic(res, './' + path)
  }
})

reloadTasks()
app.listen(PORT)
console.log('running at localhost:' + PORT + '...')
