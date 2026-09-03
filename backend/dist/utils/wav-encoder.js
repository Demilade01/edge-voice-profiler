"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WavEncoder = void 0;
/**
 * Simple WAV encoder to wrap PCM data
 */
class WavEncoder {
    static encodeWAV(samples, sampleRate = 16000, numChannels = 1) {
        const bytesPerSample = 2; // 16-bit
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = samples.length;
        const headerSize = 44;
        const fileSize = headerSize + dataSize;
        const buffer = Buffer.alloc(headerSize + dataSize);
        let offset = 0;
        // RIFF identifier 'RIFF'
        buffer.write('RIFF', offset);
        offset += 4;
        // file length minus RIFF identifier length and file description length
        buffer.writeUInt32LE(fileSize - 8, offset);
        offset += 4;
        // RIFF type 'WAVE'
        buffer.write('WAVE', offset);
        offset += 4;
        // format chunk identifier 'fmt '
        buffer.write('fmt ', offset);
        offset += 4;
        // format chunk length
        buffer.writeUInt32LE(16, offset);
        offset += 4;
        // sample format (raw)
        buffer.writeUInt16LE(1, offset);
        offset += 2;
        // channel count
        buffer.writeUInt16LE(numChannels, offset);
        offset += 2;
        // sample rate
        buffer.writeUInt32LE(sampleRate, offset);
        offset += 4;
        // byte rate (sample rate * block align)
        buffer.writeUInt32LE(byteRate, offset);
        offset += 4;
        // block align (channel count * bytes per sample)
        buffer.writeUInt16LE(blockAlign, offset);
        offset += 2;
        // bits per sample
        buffer.writeUInt16LE(16, offset);
        offset += 2;
        // data chunk identifier 'data'
        buffer.write('data', offset);
        offset += 4;
        // data chunk length
        buffer.writeUInt32LE(dataSize, offset);
        offset += 4;
        // Write the PCM samples
        samples.copy(buffer, offset);
        return buffer;
    }
}
exports.WavEncoder = WavEncoder;
