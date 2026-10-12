import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { fetchBestScores } from "../src/lib/ranking";
import { SONG_CACHE_TTL_MS } from "../src/lib/song-query";
import { resetDb } from "./helpers";
import { at, insertPlay, insertPlayers, insertSong } from "./view-helpers";

// 架空のID・名前のみ使用
const A = "428d19c3-786c-4650-81c1-06848583d7fa";
const B = "f3e1a5de-d740-43d2-bce1-cd513c9b6790";
const C = "0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c";

type SongsResponse = {
  songs: {
    gameSongId: string;
    title: string;
    artist: string | null;
    level: string | null;
    bestScores: unknown;
  }[];
  page: number;
  limit: number;
  total: number;
};

const get = (path: string) => app.request(path, {}, env);

const listSongs = async (query = "") => {
  const res = await get(`/api/v1/songs${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as SongsResponse;
};

const solo = (id: string, name: string) => [{ id, name, color: "R" as const }];

beforeEach(async () => {
  await resetDb();
  await insertPlayers(A, B, C);
});

describe("GET /api/v1/songs", () => {
  beforeEach(async () => {
    await insertSong("1000", "Zeta Song", {
      artist: "Artist X",
      level: "3",
      levelSortValue: 9,
    });
    await insertSong("002", "beta song", { level: "?" });
    await insertSong("010", "架空の曲", {
      artist: "artist y",
      level: "5+",
      levelSortValue: 16,
    });
    await insertSong("999", "Alpha", { level: "3", levelSortValue: 9 });
  });

  it("lists songs in descending numeric song id order without internal ids", async () => {
    const json = await listSongs();
    expect(json.songs.map((s) => s.gameSongId)).toEqual([
      "1000",
      "999",
      "010",
      "002",
    ]);
    expect(json).toMatchObject({ page: 1, limit: 50, total: 4 });
    expect(Object.keys(json.songs[0]!).sort()).toEqual([
      "artist",
      "bestScores",
      "gameSongId",
      "level",
      "title",
    ]);
  });

  it("searches title and artist case-insensitively and filters by level", async () => {
    expect((await listSongs("?q=SONG")).songs.map((s) => s.gameSongId)).toEqual(
      ["1000", "002"],
    );
    expect(
      (await listSongs("?q=ARTIST%20Y")).songs.map((s) => s.gameSongId),
    ).toEqual(["010"]);
    expect(
      (await listSongs("?level=3")).songs.map((s) => s.gameSongId),
    ).toEqual(["1000", "999"]);
    expect(
      (await listSongs("?level=%3F")).songs.map((s) => s.gameSongId),
    ).toEqual(["002"]);
  });

  it("searches song ids by partial match", async () => {
    expect((await listSongs("?q=99")).songs.map((s) => s.gameSongId)).toEqual([
      "999",
    ]);
  });

  it("sorts by level in ascending order with unknown levels last", async () => {
    expect(
      (await listSongs("?sort=level&dir=asc")).songs.map((s) => s.gameSongId),
    ).toEqual(["999", "1000", "010", "002"]);
  });

  it("sorts in ascending order when requested", async () => {
    expect(
      (await listSongs("?dir=asc")).songs.map((s) => s.gameSongId),
    ).toEqual(["002", "010", "999", "1000"]);
  });

  it("sorts by level in descending order by default, keeping unknown levels last and song ids ascending within a level", async () => {
    expect(
      (await listSongs("?sort=level")).songs.map((s) => s.gameSongId),
    ).toEqual(["010", "999", "1000", "002"]);
  });

  it("pages through the list", async () => {
    const json = await listSongs("?limit=3&page=2");
    expect(json.songs.map((s) => s.gameSongId)).toEqual(["002"]);
    expect(json).toMatchObject({ page: 2, limit: 3, total: 4 });
  });

  it("rejects invalid queries", async () => {
    for (const query of [
      "?sort=title",
      "?dir=up",
      "?level=abc",
      "?limit=0",
      "?page=-1",
      `?q=${"x".repeat(101)}`,
    ]) {
      expect((await get(`/api/v1/songs${query}`)).status, query).toBe(400);
    }
  });

  it("serves the cached song list until the TTL passes", async () => {
    expect((await listSongs()).total).toBe(4);
    await insertSong("500", "Late Song");
    expect((await listSongs()).total).toBe(4);

    const now = Date.now();
    const spy = vi
      .spyOn(Date, "now")
      .mockReturnValue(now + SONG_CACHE_TTL_MS + 1);
    try {
      expect(
        (await listSongs("?q=Late")).songs.map((s) => s.gameSongId),
      ).toEqual(["500"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("loads the song list again after a failed load", async () => {
    const spy = vi.spyOn(env.DB, "prepare").mockImplementationOnce(() => {
      throw new Error("D1 unavailable");
    });
    try {
      expect((await get("/api/v1/songs")).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await listSongs()).total).toBe(4);
  });

  it("ignores case only for ASCII letters, like SQLite lower()", async () => {
    await insertSong("020", "ＦＵＬＬ été");
    const search = (q: string) => listSongs(`?q=${encodeURIComponent(q)}`);
    expect((await search("ｆｕｌｌ")).total).toBe(0);
    expect((await search("ÉTÉ")).total).toBe(0);
    expect(
      (await search("ＦＵＬＬ été")).songs.map((s) => s.gameSongId),
    ).toEqual(["020"]);
  });

  it("orders song ids with the same number by their text", async () => {
    await insertSong("0010", "Padded");
    expect((await listSongs()).songs.map((s) => s.gameSongId)).toEqual([
      "1000",
      "999",
      "010",
      "0010",
      "002",
    ]);
    expect(
      (await listSongs("?dir=asc")).songs.map((s) => s.gameSongId),
    ).toEqual(["002", "0010", "010", "999", "1000"]);
  });
});

describe("best scores in the song list", () => {
  it("returns the top score per player count, with the solo name", async () => {
    const song = await insertSong("001", "架空の曲名");
    await insertPlay({
      playId: "s1",
      songRefId: song,
      score: 300,
      participants: solo(A, "Alice"),
    });
    await insertPlay({
      playId: "s2",
      songRefId: song,
      score: 500,
      participants: solo(B, "Bob"),
      excluded: true,
    });
    await insertPlay({
      playId: "d1",
      songRefId: song,
      score: 800,
      participants: [
        { id: A, name: "Alice", color: "R" },
        { id: C, name: "Carol", color: "B" },
      ],
    });
    const [entry] = (await listSongs()).songs;
    expect(entry!.bestScores).toEqual({
      "1": {
        score: 300,
        name: "Alice",
        isFullCombo: false,
        participants: [{ name: "Alice", color: "R" }],
        tiedOthers: 0,
      },
      "2": {
        score: 800,
        isFullCombo: false,
        participants: [
          { name: "Alice", color: "R" },
          { name: "Carol", color: "B" },
        ],
        tiedOthers: 0,
      },
      "3": null,
      "4": null,
    });
  });

  it("returns the first tied team with all members in color order and its full combo", async () => {
    const song = await insertSong("001", "架空の曲名");
    const withAlice = (id: string, name: string) => [
      { id, name, color: "Y" as const },
      { id: A, name: "Alice", color: "B" as const },
    ];
    await insertPlay({
      playId: "d1",
      songRefId: song,
      score: 700,
      participants: withAlice(B, "Bob"),
      isFullCombo: true,
      receivedAt: at(10),
    });
    await insertPlay({
      playId: "d2",
      songRefId: song,
      score: 700,
      participants: withAlice(C, "Carol"),
      receivedAt: at(20),
    });

    const [entry] = (await listSongs()).songs;
    expect((entry!.bestScores as Record<string, unknown>)["2"]).toEqual({
      score: 700,
      isFullCombo: true,
      participants: [
        { name: "Alice", color: "B" },
        { name: "Bob", color: "Y" },
      ],
      tiedOthers: 1,
    });
  });

  it("shows the first tied solo player in ranking order and counts the others once each", async () => {
    const song = await insertSong("001", "架空の曲名");
    await insertPlay({
      playId: "s1",
      songRefId: song,
      score: 300,
      participants: solo(B, "Bob"),
      receivedAt: at(20),
    });
    await insertPlay({
      playId: "s2",
      songRefId: song,
      score: 300,
      participants: solo(A, "Alice"),
      receivedAt: at(10),
    });
    // Aliceの同点の2回目（FC）がAliceの代表になり、受付日時が遅くなるのでBobが先頭
    await insertPlay({
      playId: "s3",
      songRefId: song,
      score: 300,
      participants: solo(A, "Alice2"),
      isFullCombo: true,
      receivedAt: at(30),
    });
    await insertPlay({
      playId: "s4",
      songRefId: song,
      score: 300,
      participants: solo(C, "Carol"),
      receivedAt: at(40),
    });

    const [entry] = (await listSongs()).songs;
    expect(entry!.bestScores).toMatchObject({
      "1": { score: 300, name: "Bob", tiedOthers: 2 },
    });

    const ranking = (await (
      await get("/api/v1/songs/001/rankings?players=1")
    ).json()) as {
      entries: { participants: { name: string }[] }[];
    };
    expect(ranking.entries[0]!.participants[0]!.name).toBe("Bob");
  });

  it("returns one row per song even when the top score is tied many times", async () => {
    const song = await insertSong("001", "架空の曲名");
    const other = await insertSong("002", "架空の別の曲");
    const batch = [];
    for (let i = 0; i < 200; i++) {
      batch.push(
        env.DB.prepare(
          `INSERT INTO play (play_id, song_ref_id, score, is_full_combo, received_at, host_player_id, player_count, team_key)
           VALUES (?, ?, 500, 0, ?, ?, 1, ?)`,
        ).bind(`t${i}`, song, at(100 + i), A, JSON.stringify([A])),
        env.DB.prepare(
          `INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, 'R')`,
        ).bind(`t${i}`, A, `Alice${i}`),
      );
    }
    await env.DB.batch(batch);
    await insertPlay({
      playId: "b1",
      songRefId: song,
      score: 500,
      participants: solo(B, "Bob"),
      receivedAt: at(150),
    });
    await insertPlay({
      playId: "o1",
      songRefId: other,
      score: 10,
      participants: solo(C, "Carol"),
    });

    const best = await fetchBestScores(env.DB, [song, other]);
    // Aliceの代表は最初の記録（受付が最も早い）なので、Aliceが先頭でBobが同点
    expect(best.get(song)!["1"]).toMatchObject({
      score: 500,
      name: "Alice0",
      tiedOthers: 1,
    });
    expect(best.get(song)!["1"]!.participants).toHaveLength(1);
    expect(best.get(other)!["1"]).toMatchObject({
      score: 10,
      name: "Carol",
      tiedOthers: 0,
    });
  });
});
