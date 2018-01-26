
import * as intel from 'intel';

intel.basicConfig({
    format: '[%(date)s] %(name)s.%(levelname)s: %(message)s',
    level: intel[process.env.LOG_LEVEL || 'INFO'],
});

export default intel;
