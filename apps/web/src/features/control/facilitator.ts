import type { ControlChannel } from './channel';
import type {
  CmdLoad,
  CmdUnload,
  CmdSeek,
  CmdPlay,
  CmdStop,
  CmdCrossfade,
  CmdSetGain,
  CmdDucking,
} from './protocol';

export function createFacilitator(control: ControlChannel) {
  return {
    load: (cmd: CmdLoad) => control.load(cmd),
    unload: (cmd: CmdUnload) => control.unload(cmd),
    seek: (cmd: CmdSeek) => control.seek(cmd),
    play: (cmd: CmdPlay) => control.play(cmd),
    stop: (cmd: CmdStop) => control.stop(cmd),
    crossfade: (cmd: CmdCrossfade) => control.crossfade(cmd),
    gain: (cmd: CmdSetGain) => control.setGain(cmd),
    ducking: (cmd: CmdDucking) => control.ducking(cmd),
  };
}
