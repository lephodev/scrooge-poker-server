def COLOR_MAP = [
    'SUCCESS': 'good', 
    'FAILURE': 'danger',
]
pipeline {

    environment {
        // test variable: 0=success, 1=fail; must be string
        doError = '0'
    }
  agent any
  stages {
    stage('Upload Build') {
          steps {
            sshPublisher(publishers: [sshPublisherDesc(configName: 'scrooge-casino', transfers: [sshTransfer(cleanRemote: false, excludes: '', execCommand: '''rm /home/ubuntu/package.json
cd /home/ubuntu/poker-server && git add .
cd /home/ubuntu/poker-server && git commit -m "update"
cd /home/ubuntu/poker-server && git pull origin prod
cd /home/ubuntu/poker-server && npm install
pm2 delete poker-server
cd /home/ubuntu/poker-server && pm2 start ecosystem.config.json''', execTimeout: 120000, flatten: false, makeEmptyDirs: false, noDefaultExcludes: false, patternSeparator: '[, ]+', remoteDirectory: '/', remoteDirectorySDF: false, removePrefix: '', sourceFiles: 'package.json')], usePromotionTimestamp: false, useWorkspaceInPromotion: false, verbose: true)])
            }
        }
  }
 post {
        always {

            
            slackSend channel: 'buildstatus',
                color: COLOR_MAP[currentBuild.currentResult],
                   message: "*${currentBuild.currentResult}:* Job ${env.JOB_NAME} build ${env.BUILD_NUMBER}\n More info at: ${env.BUILD_URL}console"
             
        }
    }
}
