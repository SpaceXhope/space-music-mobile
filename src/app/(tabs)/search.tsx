import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileApi } from "@/api/client";
import type { ApiTrack, SearchResult } from "@/api/contracts";
import { TrackRow } from "@/components/TrackRow";
import { MusicGlyph } from "@/components/MusicGlyph";
import { trackFromApi, type MusicTrack } from "@/domain/music";
import { useLibrary } from "@/features/library/LibraryProvider";
import { usePlayer } from "@/features/player/PlayerProvider";
import { colors, radii } from "@/theme";

function isTrack(
  item: SearchResult,
): item is ApiTrack & { type: "track" } {
  return item.type === "track";
}

function isArtist(
  item: SearchResult,
): item is { type: "artist"; id: string; name: string } {
  return item.type === "artist";
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { likedIds, toggleLike } = useLibrary();
  const { playTrack, startArtistRadio, stopRadio, radioArtists } = usePlayer();
  const [radioBusy, setRadioBusy] = useState(false);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      const timer = setTimeout(() => {
        setResults([]);
        setArtists([]);
        setError("");
      }, 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void mobileApi
        .search(clean, controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return;
          setResults(
            response.items.filter(isTrack).map((track) => trackFromApi(track)),
          );
          setArtists(
            [
              ...new Set(
                response.items
                  .filter(isArtist)
                  .map((artist) => artist.name.trim())
                  .filter(Boolean),
              ),
            ].slice(0, 3),
          );
        })
        .catch((nextError) => {
          if (
            controller.signal.aborted ||
            (nextError instanceof Error && nextError.name === "AbortError")
          ) {
            return;
          }
          if (!controller.signal.aborted)
            setError(
              nextError instanceof Error ? nextError.message : "Ошибка поиска",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const empty = useMemo(() => {
    if (loading || query.trim().length < 2) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>⌕</Text>
        <Text style={styles.emptyTitle}>{error || "Ничего не найдено"}</Text>
        <Text style={styles.emptyCopy}>
          Попробуйте название песни или исполнителя.
        </Text>
      </View>
    );
  }, [error, loading, query]);

  const activeRadio = radioArtists[0] ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Поиск</Text>
        <View style={styles.inputShell}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Треки, исполнители, альбомы"
            placeholderTextColor={colors.textDim}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
          />
          {loading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : null}
        </View>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={empty ?? <View />}
        ListHeaderComponent={
          artists.length > 0 ? (
            <View style={styles.artistBlock}>
              <Text style={styles.artistLabel}>ИСПОЛНИТЕЛИ</Text>
              {artists.map((artist) => {
                const active = activeRadio === artist;
                return (
                  <Pressable
                    key={artist}
                    accessibilityRole="button"
                    accessibilityLabel={
                      active
                        ? `Остановить поток ${artist}`
                        : `Бесконечный поток: ${artist}`
                    }
                    disabled={radioBusy}
                    onPress={() => {
                      if (active) {
                        stopRadio();
                        return;
                      }
                      setRadioBusy(true);
                      void startArtistRadio([artist])
                        .catch(() =>
                          setError("Не удалось собрать поток исполнителя"),
                        )
                        .finally(() => setRadioBusy(false));
                    }}
                    style={[styles.artistCard, active && styles.artistCardActive]}
                  >
                    <View style={styles.artistIcon}>
                      <MusicGlyph kind="play" size={16} color={colors.canvas} />
                    </View>
                    <View style={styles.artistCopy}>
                      <Text numberOfLines={1} style={styles.artistName}>
                        {artist}
                      </Text>
                      <Text style={styles.artistMeta}>
                        {active
                          ? "Поток играет — бесконечная очередь"
                          : "Радио исполнителя · бесконечный поток"}
                      </Text>
                    </View>
                    {active ? (
                      <MusicGlyph kind="pause" size={18} color={colors.accent} />
                    ) : (
                      <Text style={styles.artistChevron}>›</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            liked={likedIds.has(item.id)}
            onLike={() => void toggleLike(item).catch(() => undefined)}
            onPress={() => void playTrack(item, results).catch(() => undefined)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 11 },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
  },
  inputShell: {
    height: 52,
    marginTop: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 13,
  },
  searchIcon: { color: colors.textMuted, fontSize: 21 },
  input: { flex: 1, color: colors.text, fontSize: 14 },
  list: { paddingHorizontal: 8, paddingBottom: 180 },
  empty: { alignItems: "center", paddingHorizontal: 35, paddingTop: 90 },
  emptyIcon: { color: colors.accent, fontSize: 42 },
  emptyTitle: {
    marginTop: 12,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyCopy: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  artistBlock: { paddingHorizontal: 8, gap: 8, marginBottom: 10 },
  artistLabel: {
    marginTop: 4,
    color: colors.textDim,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  artistCard: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
  },
  artistCardActive: {
    borderColor: "rgba(102,185,255,0.45)",
    backgroundColor: "rgba(102,185,255,0.10)",
  },
  artistIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  artistCopy: { flex: 1, minWidth: 0, gap: 3 },
  artistName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  artistMeta: { color: colors.textMuted, fontSize: 11 },
  artistChevron: { color: colors.textDim, fontSize: 22 },
});