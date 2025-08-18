import type { ControlChannel } from './channel';
import type {
  CmdPlay,
  CmdStop,
  CmdCrossfade,
  CmdSetGain,
  CmdDucking,
} from './protocol';

export function createFacilitator(control: ControlChannel) {
  return {
    play: (cmd: CmdPlay) => control.play(cmd),
    stop: (cmd: CmdStop) => control.stop(cmd),
    crossfade: (cmd: CmdCrossfade) => control.crossfade(cmd),
    gain: (cmd: CmdSetGain) => control.setGain(cmd),
    ducking: (cmd: CmdDucking) => control.ducking(cmd),
  };
}
