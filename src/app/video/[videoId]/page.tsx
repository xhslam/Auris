import { DesktopVideoDetailShell } from "@/components/desktop/desktop-video-detail-shell";

type VideoDetailPageProps = {
  params: Promise<{
    videoId: string;
  }>;
};

export default async function VideoDetailPage({ params }: VideoDetailPageProps) {
  const { videoId } = await params;

  return <DesktopVideoDetailShell videoId={videoId} />;
}
