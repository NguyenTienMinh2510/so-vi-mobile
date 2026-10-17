Pod::Spec.new do |s|
  s.name = 'SoViNative'
  s.version = '1.0.0'
  s.summary = 'Local Sổ Ví OCR and durable Shortcuts inbox'
  s.description = s.summary
  s.license = { :type => 'Private' }
  s.author = 'Sổ Ví'
  s.homepage = 'https://expo.dev'
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
