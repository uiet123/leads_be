const neighborhoods = {
  mumbai: [
    'Andheri', 'Bandra', 'Colaba', 'Juhu', 'Powai', 'Malad', 'Goregaon',
    'Lower Parel', 'Dadar', 'Worli', 'Borivali', 'Kandivali', 'Santacruz',
    'Vile Parle', 'Khar', 'Chembur', 'Kurla', 'Ghatkopar'
  ],
  delhi: [
    'Connaught Place', 'Hauz Khas', 'Saket', 'Vasant Kunj', 'Karol Bagh',
    'Dwarka', 'Rohini', 'Pitampura', 'Lajpat Nagar', 'South Extension',
    'Rajouri Garden', 'Janakpuri', 'Greater Kailash', 'DefCol'
  ],
  bangalore: [
    'Koramangala', 'Indiranagar', 'Jayanagar', 'Whitefield', 'HSR Layout',
    'Malleshwaram', 'Basavanagudi', 'Marathahalli', 'Electronic City',
    'BTM Layout', 'JP Nagar', 'Banashankari'
  ],
  gurugram: [
    'Cyber City', 'DLF Phase 1', 'DLF Phase 2', 'DLF Phase 3', 'DLF Phase 4',
    'DLF Phase 5', 'Sector 29', 'Golf Course Road', 'Sohna Road', 'Udyog Vihar',
    'Sector 14', 'Sector 50', 'Sector 54'
  ]
};

function getNeighborhoodsForCity(city) {
  const normalizedCity = city.toLowerCase().trim();
  return neighborhoods[normalizedCity] || [];
}

module.exports = {
  neighborhoods,
  getNeighborhoodsForCity
};
