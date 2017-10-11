
import * as intel from 'intel';

intel.basicConfig({
    format: '[%(date)s] %(name)s.%(levelname)s: %(message)s',
    level: intel.INFO,
});

export default intel;
