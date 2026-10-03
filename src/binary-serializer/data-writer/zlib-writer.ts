import { deflateSync } from "node:zlib";
import { ArrayDataWriter } from "./array-writer.ts";

export class ZlibDataWriter extends ArrayDataWriter {
  override getBytes(): ArrayBuffer {
    // zlib returns a Buffer that can cover only part of its backing allocation.
    return Uint8Array.from(this.getBytesView()).buffer;
  }

  override getBytesView(): Uint8Array {
    // Cannot make a nice efficient view here, since we deflate on-demand.
    return deflateSync(super.getBytesView(), { windowBits: 15 });
  }
}
