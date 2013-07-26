//remove:
var dblite = require('../build/dblite.node.js'),
    file = require('path').join(
      require('os').tmpdir(), 'dblite.test.sqlite'
    ),
    db;
//:remove

wru.test([
  {
    name: "main",
    test: function () {
      wru.assert(typeof dblite == "function");
      db = dblite(file);
    }
  },{
    name: 'create table if not exists',
    test: function () {
      db.query('CREATE TABLE IF NOT EXISTS `kvp` (id INTEGER PRIMARY KEY, key TEXT, value TEXT)');
      db.on('info', wru.async(function (data) {
        db.removeListener('table exists', arguments.callee);
        wru.assert('table exists', /^kvp\b/.test('' + data));
      }));
      db.query('.tables');
    }
  },{
    name: '1000 sequential inserts',
    test: function () {
      var start = Date.now(), many = 0;
      db.on('error', wru.log);
      while(many++ < 1000) {
        db.query('INSERT INTO kvp VALUES(null, "k' + many + '", "v' + many + '")');
      }
      db.lastRowID('kvp', wru.async(function(data){
        wru.log(data + ' records in ' + ((Date.now() - start) / 1000) + ' seconds');
        wru.assert(1000 == data);
      }));
    }
  },{
    name: '1 transaction with 1000 inserts',
    test: function () {
      var start = Date.now(), many = 0;
      db.on('error', wru.log);
      db.query('BEGIN TRANSACTION');
      while(many++ < 1000) {
        db.query('INSERT INTO kvp VALUES(null, "k' + many + '", "v' + many + '")');
      }
      db.query('COMMIT');
      db.lastRowID('kvp', wru.async(function(data){
        wru.log(data + ' records in ' + ((Date.now() - start) / 1000) + ' seconds');
        wru.assert(2000 == data);
      }));
    }
  },{
    name: 'erease file',
    test: function () {
      db.on('close', wru.async(function () {
        require('fs').unlinkSync(file);
        wru.assert('bye bye');
      })).close();
    }
  }
]);
