import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import { Text as RNText, StyleSheet, TouchableOpacity } from "react-native";

import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

export default function CategoriesScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const tint = Colors[colorScheme].tint;

  return (
    <View style={styles.container}>
      <FontAwesome name="th-large" size={48} color={tint} style={styles.icon} />
      <Text style={styles.title}>Categories</Text>
      <Text style={styles.subtitle}>
        No categories yet. Add your first category!
      </Text>

      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.button, { backgroundColor: tint }]}
        onPress={() => router.push("/add-category")}
      >
        <FontAwesome name="plus" size={16} color="#fff" />
        <RNText style={styles.buttonText}>Add Category</RNText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 8,
    marginBottom: 28,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
