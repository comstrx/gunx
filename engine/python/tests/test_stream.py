from collections.abc import AsyncIterator
from engine.error import Code, Fault
from engine.fs import dir, file
from engine.http import App, Request, Response, Route
from engine.stream import Dash, Hls, Pipe, Range, Representation, Segment, Stream, Tee, Uploads, Variant, stream
from pathlib import Path
from typing import Any
import aiohttp, asyncio, pytest

async def gather ( source: AsyncIterator[bytes] | None ) -> bytes:

    return b"".join([piece async for piece in source]) if source is not None else b""

async def feed ( pieces: list[bytes] ) -> AsyncIterator[bytes]:

    for piece in pieces: yield piece

def test_ranges_follow_rfc_9110 () -> None:

    assert Range.parse(None, 10) is None and Range.parse("  ", 10) is None
    assert Range.parse("bytes=0-4", 10) == Range(0, 4, 10) and Range(0, 4, 10).length() == 5 and Range(0, 4, 10).header() == "bytes 0-4/10"
    assert Range.parse("bytes=5-", 10) == Range(5, 9, 10) and Range.parse("bytes=-3", 10) == Range(7, 9, 10) and Range.parse("bytes=-30", 10) == Range(0, 9, 10)
    assert Range.parse("bytes=2-99", 10) == Range(2, 9, 10) and Range(0, 9, 10).whole() and not Range(1, 9, 10).whole()

    for bad in ("bytes=10-", "bytes=5-2", "bytes=-0", "bytes=-", "items=0-1", "bytes=0-1,3-4"):

        with pytest.raises(Fault) as caught: Range.parse(bad, 10)

        assert caught.value.status == 416 and caught.value.reason == "stream.range" and caught.value.headers == { "Content-Range": "bytes */10" }

    with pytest.raises(Fault): Range.parse("bytes=0-1", 0)

async def test_files_serve_whole_ranged_conditional_and_head ( tmp_path: Path ) -> None:

    path = tmp_path / "clip.bin"
    data = bytes(range(256)) * 4

    await file.write(path, data)

    whole = await stream.file(path, "video/mp4", cache=60)

    assert whole.status == 200 and whole.headers["Content-Length"] == "1024" and whole.headers["Accept-Ranges"] == "bytes" and whole.headers["Cache-Control"] == "public, max-age=60"
    assert await gather(whole.body) == data and whole.media == "video/mp4" and not whole.partial()

    part = await stream.file(path, range_="bytes=100-299")

    assert part.status == 206 and part.headers["Content-Range"] == "bytes 100-299/1024" and part.headers["Content-Length"] == "200"
    assert await gather(part.body) == data[100:300] and part.partial() and part.dump()["length"] == 200

    tail = await stream.file(path, range_="bytes=-24")

    assert await gather(tail.body) == data[-24:]

    same = await stream.file(path, match=whole.headers["ETag"])

    assert same.status == 304 and same.body is None and same.headers["ETag"] == whole.headers["ETag"]

    stale = await stream.file(path, range_="bytes=0-9", condition='W/"nope"')

    assert stale.status == 200 and await gather(stale.body) == data

    head = await stream.file(path, head=True, name="my clip.bin")

    assert head.body is None and head.headers["Content-Length"] == "1024" and head.headers["Content-Disposition"].startswith("attachment; filename=")

    pieces = [piece async for piece in stream.slice(path, 0, 1023, chunk=400)]

    assert [len(piece) for piece in pieces] == [400, 400, 224]

    with pytest.raises(Fault) as missing: await stream.file(tmp_path / "nothing.bin")

    assert missing.value.code is Code.NOT_FOUND and missing.value.reason == "stream.file"

    with pytest.raises(Fault) as bad: await stream.file(path, range_="bytes=5000-")

    assert bad.value.status == 416

    assert stream.stats()["served"] >= 5 and stream.describe()["chunk"] == 256 * 1024

    with pytest.raises(Fault): Stream().setup(chunk=10)

async def test_chunks_lines_and_pacing () -> None:

    rechunked = [piece async for piece in stream.chunks(feed([b"ab", b"cdef", b"g"]), 3)]

    assert rechunked == [b"abc", b"def", b"g"]

    async def items () -> AsyncIterator[object]:

        yield { "n": 1 }
        yield [1, 2]

    assert await gather(stream.lines(items())) == b'{"n":1}\n[1,2]\n'

    loop  = asyncio.get_running_loop()
    begun = loop.time()
    paced = [len(piece) async for piece in stream.pace(feed([b"x" * 1000] * 4), rate=10000, burst=1000)]

    assert paced == [1000] * 4 and loop.time() - begun >= 0.25

    with pytest.raises(Fault): [piece async for piece in stream.pace(feed([]), rate=0)]

async def test_pipes_and_tees_bound_their_producers () -> None:

    pipe = Pipe(capacity=1)

    await pipe.write(b"one")

    assert pipe.pending() == 1 and not pipe.offer(b"two") and pipe.describe()["dropped"] == 1

    with pytest.raises(Fault) as slow: await pipe.write(b"three", wait=0.01)

    assert slow.value.code is Code.TIMEOUT and slow.value.reason == "stream.backpressure"

    assert await pipe.read() == b"one"

    await pipe.write(b"four")
    await pipe.close()

    assert [piece async for piece in pipe] == [b"four"] and pipe.closed()

    with pytest.raises(Fault) as gone: await pipe.write(b"late")

    assert gone.value.code is Code.GONE

    tee = Tee(capacity=1)
    _, first = tee.subscribe()
    second_token, second = tee.subscribe()

    assert tee.count() == 2 and await tee.write(b"a") == 2 and await tee.write(b"b") == 0
    assert await first.read() == b"a" and tee.unsubscribe(second_token) and not tee.unsubscribe(second_token)
    assert await second.read() == b"a" and await second.read() is None and await tee.write(b"c") == 1

    await tee.close()

    assert tee.describe()["closed"] and [piece async for piece in first] == [b"c"]

    with pytest.raises(Fault): tee.subscribe()

    assert stream.pipe(2).describe()["pending"] == 0 and stream.tee().count() == 0

def test_playlists_render_hls_and_dash () -> None:

    segments = [Segment("seg0.ts", 4.0), Segment("seg1.ts", 3.5, discontinuity=True), Segment("seg2.ts", 4.0, byterange=(1000, 2000))]
    vod      = Hls.media(segments)

    assert vod.startswith("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n")
    assert "#EXT-X-DISCONTINUITY\n#EXTINF:3.500,\nseg1.ts\n" in vod and "#EXT-X-BYTERANGE:1000@2000\n#EXTINF:4.000,\nseg2.ts\n" in vod and vod.endswith("#EXT-X-ENDLIST\n")

    window, dropped = Hls.window(segments, 2)
    live            = Hls.media(window, sequence=dropped, live=True, version=7, init="init.mp4")

    assert dropped == 1 and "#EXT-X-MEDIA-SEQUENCE:1\n" in live and '#EXT-X-MAP:URI="init.mp4"' in live and "ENDLIST" not in live and "VOD" not in live

    master = Hls.master([Variant("hi/index.m3u8", 5_000_000, "1920x1080", "avc1.640028,mp4a.40.2", 30.0), Variant("lo/index.m3u8", 800_000, "640x360")])

    assert master.index("lo/index.m3u8") < master.index("hi/index.m3u8")
    assert '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,FRAME-RATE=30.000,CODECS="avc1.640028,mp4a.40.2"\nhi/index.m3u8' in master

    mpd = Dash.manifest(125.5, [Representation("720", 2_500_000, 1280, 720)], segment=4.0)

    assert 'mediaPresentationDuration="PT0H2M5.500S"' in mpd and '<Representation id="720" bandwidth="2500000" width="1280" height="720"' in mpd
    assert '<SegmentTemplate timescale="1000" duration="4000" initialization="init-$RepresentationID$.m4s"' in mpd and segments[2].dump()["byterange"] == (1000, 2000)

    for broken in (lambda: Hls.media([]), lambda: Hls.master([]), lambda: Hls.window(segments, 0), lambda: Dash.manifest(0, [])):

        with pytest.raises(Fault): broken()

async def test_uploads_resume_by_offset ( tmp_path: Path ) -> None:

    uploads = Uploads(tmp_path / "parts", limit=100)

    await dir.make(tmp_path / "parts")

    begun = await uploads.start("up-1", 10, name="a.bin", media="application/octet-stream")

    assert begun.offset == 0 and begun.remaining() == 10 and not begun.done() and begun.dump()["name"] == "a.bin"

    grown = await uploads.append("up-1", 0, b"12345")

    assert grown.offset == 5 and (await uploads.status("up-1")).offset == 5

    with pytest.raises(Fault) as skew: await uploads.append("up-1", 3, b"x")

    assert skew.value.code is Code.CONFLICT and skew.value.reason == "upload.offset" and skew.value.headers == { "Upload-Offset": "5" }

    with pytest.raises(Fault) as over: await uploads.append("up-1", 5, b"123456")

    assert over.value.code is Code.TOO_LARGE and over.value.reason == "upload.overflow"

    with pytest.raises(Fault) as early: await uploads.finish("up-1", tmp_path / "a.bin")

    assert early.value.code is Code.PRECONDITION_FAILED

    done = await uploads.append("up-1", 5, b"67890")

    assert done.done() and await uploads.finish("up-1", tmp_path / "a.bin") == tmp_path / "a.bin"
    assert await file.read(tmp_path / "a.bin") == b"1234567890" and not await file.has(await uploads.meta("up-1"))

    with pytest.raises(Fault) as missing: await uploads.status("up-1")

    assert missing.value.reason == "upload.missing"

    with pytest.raises(Fault) as big: await uploads.start("up-2", 1000)

    assert big.value.code is Code.TOO_LARGE

    with pytest.raises(Fault): await uploads.start("up-3", 0)
    with pytest.raises(Fault) as odd: await uploads.start("../evil", 5)

    assert odd.value.reason == "upload.id"

    await uploads.start("up-4", 5)

    with pytest.raises(Fault) as twice: await uploads.start("up-4", 5)

    assert twice.value.reason == "upload.exists" and await uploads.abort("up-4") and not await uploads.abort("up-4")
    assert await uploads.sweep(older_than=-1) == 0 and uploads.describe()["limit"] == 100

async def test_ranged_files_flow_through_http ( tmp_path: Path ) -> None:

    path = tmp_path / "song.bin"
    data = bytes(range(256)) * 2

    await file.write(path, data)

    async def song ( request: Request ) -> Any:

        served = await stream.file(path, "audio/mpeg", request.header("range"), request.header("if-none-match"))

        return Response.stream(served.body, served.media, served.headers, served.status)

    app = App("Stream App", docs=False)

    app.mount(Route.get("/song", song, "song"))

    async with app.listen() as url, aiohttp.ClientSession() as http:

        async with http.get(f"{url}/song", headers={ "Range": "bytes=10-19" }) as partial:

            assert partial.status == 206 and partial.headers["Content-Range"] == "bytes 10-19/512" and await partial.read() == data[10:20]

        async with http.get(f"{url}/song") as whole:

            assert whole.status == 200 and await whole.read() == data and whole.headers["Accept-Ranges"] == "bytes"

            tag = whole.headers["ETag"]

        async with http.get(f"{url}/song", headers={ "If-None-Match": tag }) as same:

            assert same.status == 304 and await same.read() == b""

        async with http.get(f"{url}/song", headers={ "Range": "bytes=999-" }) as bad:

            assert bad.status == 416 and bad.headers["Content-Range"] == "bytes */512"
