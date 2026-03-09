import { Seo } from '../components/Seo'
import { MarketingShell } from '../components/marketing/MarketingShell'
import { ToolCatalog } from '../components/marketing/ToolCatalog'
import { toolCatalog } from '../content/site'

export function ToolsPage() {
  return (
    <>
      <Seo
        title="ai-tools product catalog"
        description="Explore every tool currently shipped in the ai-tools repo: whip, claude-irc, redit, vaultkey, webform, and vaultkey-action."
        path="/tools"
        keywords={['ai-tools', 'whip', 'claude-irc', 'redit', 'vaultkey', 'webform']}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'ai-tools product catalog',
          description: 'Catalog of tools in the ai-tools repository.',
          hasPart: toolCatalog.map(tool => ({
            '@type': 'SoftwareApplication',
            name: tool.name,
            applicationCategory: tool.category,
            url: tool.href,
            description: tool.description,
          })),
        }}
      />
      <MarketingShell
        eyebrow="Product Catalog"
        title="Tools that make the run work"
        subtitle="whip orchestrates. The rest of the stack handles coordination, secrets, remote editing, and input collection — so the run stays smooth."
      >
        <ToolCatalog tools={toolCatalog} />
      </MarketingShell>
    </>
  )
}
