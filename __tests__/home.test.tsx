import { render, screen } from '@testing-library/react-native';
import Home from '../app/index';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../modules/scanner', () => ({ coreInfo: () => ({ opencv: '5.1.0', onnxruntime: '1.32.0' }) }));

test('home offers the gallery', async () => {
  await render(<Home />);
  expect(screen.getByText('Choose from gallery')).toBeTruthy();
});

test("home shows the core's libraries", async () => {
  await render(<Home />);
  expect(screen.getByText('OpenCV 5.1.0 · ONNX Runtime 1.32.0')).toBeTruthy();
});
