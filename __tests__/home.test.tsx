import { render, screen } from '@testing-library/react-native';
import Home from '../app/index';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

test('home offers the gallery', async () => {
  await render(<Home />);
  expect(screen.getByText('Choose from gallery')).toBeTruthy();
});
