
var intel = require('intel');

intel.basicConfig({
  //file: '/path/to/file.log', // file and stream are exclusive. only pass 1
  format: '[%(date)s] %(name)s.%(levelname)s: %(message)s',
  level: intel.DEBUG
});

module.exports = intel;
