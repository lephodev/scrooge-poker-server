pipeline {
  agent any
  stages {
    stage('Upload Build') {
          steps {
            sshPublisher(publishers: [sshPublisherDesc(configName: 'scrooge-casino', transfers: [sshTransfer(cleanRemote: false, excludes: '', execCommand: '''rm /home/ubuntu/package.json
cd /home/ubuntu/poker-server && git add .
cd /home/ubuntu/poker-server && git commit -m "update"
cd /home/ubuntu/poker-server && git pull origin main
cd /home/ubuntu/poker-server && npm install
pm2 kill
pm2 start /home/ubuntu/poker-server/ecosystem.config.json
pm2 start /home/ubuntu/landing-server/ecosystem.config.json''', execTimeout: 120000, flatten: false, makeEmptyDirs: false, noDefaultExcludes: false, patternSeparator: '[, ]+', remoteDirectory: '/', remoteDirectorySDF: false, removePrefix: '', sourceFiles: 'package.json')], usePromotionTimestamp: false, useWorkspaceInPromotion: false, verbose: true)])
            }
        }
  }
}
