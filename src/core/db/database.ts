import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

let dbReady = false;

export async function initializeDatabase(): Promise<void> {
  if (dbReady) return;
  dbReady = true;

  if (Platform.OS === 'web') {
    return;
  }

  const dir = `${FileSystem.documentDirectory}db`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}
