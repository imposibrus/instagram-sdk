
const intel = require('intel');

intel.basicConfig({
    format: '[%(date)s] %(name)s.%(levelname)s: %(message)s',
    level: intel.INFO
});

module.exports = intel;
