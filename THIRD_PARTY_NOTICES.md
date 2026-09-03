# Third-party notices

This application may include the following separately licensed component.

## FFmpeg

The Windows package embeds the **LGPL** variant of FFmpeg for local video and
audio processing.  Its exact license text is supplied in the installed
`_internal/licenses` directory.  FFmpeg source code is available from
<https://ffmpeg.org/download.html>.  The build used for this package is from
<https://github.com/BtbN/FFmpeg-Builds/releases>, specifically the `win64-lgpl`
variant.

This application invokes `ffmpeg.exe` as a separate process.  FFmpeg and this
application are independent programs; this notice does not change the license
of this application's own source code.
