import Script from 'next/script'

interface OrganizationSchemaProps {
  url: string
}

export function OrganizationSchema({ url }: OrganizationSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: 'YB MOTOCOM',
    description: 'Tienda especializada en accesorios y equipamiento para motociclistas en Colombia',
    url: url,
    logo: `${url}/logo.png`,
    image: `${url}/og-image.jpg`,
    telephone: '+57-321-411-1371',
    email: 'ybmotocom@gmail.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1',
      addressLocality: 'Bogotá',
      addressRegion: 'Cundinamarca',
      postalCode: '110111',
      addressCountry: 'CO',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 4.598889,
      longitude: -74.075833,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '09:00',
        closes: '14:00',
      },
    ],
    sameAs: [
      'https://facebook.com/ybmotocom',
      'https://instagram.com/ybmotocom',
      'https://twitter.com/ybmotocom',
    ],
    priceRange: '$$',
    paymentAccepted: 'Cash, Credit Card, Debit Card, Nequi, Daviplata',
    currenciesAccepted: 'COP',
  }

  return (
    <Script
      id="organization-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

interface ProductSchemaProps {
  product: {
    name: string
    description: string
    image: string
    price: number
    currency: string
    availability: string
    sku?: string
    brand?: string
  }
  url: string
}

export function ProductSchema({ product, url }: ProductSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku || 'N/A',
    brand: {
      '@type': 'Brand',
      name: product.brand || 'YB MOTOCOM',
    },
    offers: {
      '@type': 'Offer',
      url: url,
      priceCurrency: product.currency,
      price: product.price,
      availability: `https://schema.org/${product.availability}`,
      seller: {
        '@type': 'Organization',
        name: 'YB MOTOCOM',
      },
    },
  }

  return (
    <Script
      id="product-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

interface BreadcrumbSchemaProps {
  items: Array<{
    name: string
    url: string
  }>
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return (
    <Script
      id="breadcrumb-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

interface WebPageSchemaProps {
  name: string
  description: string
  url: string
}

export function WebPageSchema({ name, description, url }: WebPageSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: name,
    description: description,
    url: url,
    publisher: {
      '@type': 'Organization',
      name: 'YB MOTOCOM',
      logo: {
        '@type': 'ImageObject',
        url: `${url}/logo.png`,
      },
    },
  }

  return (
    <Script
      id="webpage-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
