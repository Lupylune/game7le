import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import RunPage from './pages/RunPage';
import Classement from './pages/Classement';
import CommentJouer from './pages/CommentJouer';
import APropos from './pages/APropos';
import Archives from './pages/Archives';
import Parametres from './pages/Parametres';
import { EntrainementListe, EntrainementJeu } from './pages/Entrainement';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/jouer" element={<RunPage />} />
          <Route path="/jouer/:date" element={<RunPage />} />
          <Route path="/classement" element={<Classement />} />
          <Route path="/comment-jouer" element={<CommentJouer />} />
          <Route path="/a-propos" element={<APropos />} />
          <Route path="/archives" element={<Archives />} />
          <Route path="/entrainement" element={<EntrainementListe />} />
          <Route path="/entrainement/:id" element={<EntrainementJeu />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
