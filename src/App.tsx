import { useRoute } from './lib/router.ts';
import { FoodList } from './screens/FoodList.tsx';
import { FuelList } from './screens/FuelList.tsx';
import { MapScreen } from './screens/MapScreen.tsx';
import { RestList } from './screens/RestList.tsx';
import { Saved } from './screens/Saved.tsx';
import { Setup } from './screens/Setup.tsx';
import { Sources } from './screens/Sources.tsx';
import { StayList } from './screens/StayList.tsx';
import { Trip } from './screens/Trip.tsx';

export function App() {
  const route = useRoute();
  return (
    <div className="app">
      {route === 'setup' && <Setup />}
      {route === 'trip' && <Trip />}
      {route === 'fuel' && <FuelList />}
      {route === 'rest' && <RestList />}
      {route === 'food' && <FoodList />}
      {route === 'stay' && <StayList />}
      {route === 'saved' && <Saved />}
      {route === 'map' && <MapScreen />}
      {route === 'sources' && <Sources />}
    </div>
  );
}
