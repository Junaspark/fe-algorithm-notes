import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return { name: '前端算法训练场', short_name: 'FE Gym', description: '每日 JavaScript 面试训练', start_url: '/today', display: 'standalone', background_color: '#f3efe5', theme_color: '#183c34', lang: 'zh-CN' }
}
