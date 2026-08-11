import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import Banner from './Banner';
import HelpLink from './HelpLink';

export default function FfmpegBanner() {
  const { data } = useQuery({ queryKey: ['info'], queryFn: api.getInfo, staleTime: 60_000 });
  if (!data || data.ffmpeg) return null;
  return (
    <div className="mb-4">
      <Banner>
        Sem <b>ffmpeg</b>, os cursos ficam sem capas e sem a duração das aulas.{' '}
        <HelpLink topico="sem-capas">Como instalar</HelpLink>
      </Banner>
    </div>
  );
}
