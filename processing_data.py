import ast
import json
import os
from pprint import pprint

import pandas as pd
import pyperclip
from PIL import Image


def get_polygon(boundingbox_percentageofimage, image_height, image_width):
    """
    Calculate the polygon coordinates of a bounding box based on its percentage
    of the image dimensions.
    Args:
        boundingbox_percentageofimage (dict): A dictionary containing the bounding box
            percentages with keys 'x', 'y', 'width', and 'height'.
        image_height (int): The height of the image.
        image_width (int): The width of the image.
    Returns:
        list: A list of tuples representing the polygon coordinates of the bounding box.
    """
    
    x = boundingbox_percentageofimage['x'] * image_width / 100
    y = boundingbox_percentageofimage['y'] * image_height / 100
    width = boundingbox_percentageofimage['width'] * image_width / 100
    height = boundingbox_percentageofimage['height'] * image_height / 100

    polygon = [
        (x, y),
        (x + width, y),
        (x + width, y + height),
        (x, y + height)
    ]
    
    return polygon


def check_final_stats(file_input_name):
    """
    Reads a JSON file, processes the data, and prints a pivot table of user topic counts.
    Args:
        file_input_name (str): The name of the input JSON file (without extension) located in 'our_dataset_benchmark/data/'.
    Returns:
        None: This function prints the pivot table and does not return any value.
    """
    
    df = pd.read_json(f'our_dataset_benchmark/data/{file_input_name}.json')
        # Extract the 'id' and 'user' from the 'id' column
    df[['pid', 'user']] = df['id'].str.split('_', expand=True).iloc[:, [0, 1]]
    
    user_topic_counts = df.groupby(['topic', df['id'].str.split('_').str[1]]).size().reset_index(name='counts')
    user_topic_pivot = user_topic_counts.pivot(index='topic', columns='id', values='counts').fillna(0).astype(int)
    print(user_topic_pivot)
    

def change_format_from_labelstudio(label_studio_file, res_name):
    """
    Converts and formats annotation data from Label Studio JSON files to a custom format (for calculating bcubed) and saves the results to a new JSON file.
    Args:
        label_studio_file (str): The filename of the Label Studio JSON file to be processed.
        res_name (str): The name of the resulting JSON file to save the formatted data.
    Raises:
        FileNotFoundError: If the specified Label Studio JSON file does not exist.
        json.JSONDecodeError: If the specified Label Studio JSON file is not a valid JSON.
    Notes:
        - The function reads the Label Studio JSON file, processes the annotations, and extracts relevant information.
        - It handles bounding box annotations, polygon calculations, and metadata extraction.
        - The resulting annotations are saved in a new JSON file with the specified name.
        - If in meta a hyu is specified, picks that instead of the info from the id.
    """

    # merge with results from Label studio 
    with open(f'our_dataset_benchmark/data/{label_studio_file}' , 'r') as f:
        labelstudio_json = json.load(f)
    
    final_results = []
    
    #updated results in annotation / updated hyutags in meta
    for res_ele in labelstudio_json:
        # annotations results (new results from labelstudion, (predicitions from chrome extension))
        results = res_ele['annotations'][0]['result']
        pid = res_ele['data']['pid']
        user = res_ele['data']['user']
        id = f'{pid}_{user}'
        pid_user_annotations = {'id': id, 'annotation':[],  'digilog_annotation': [], 
                                'screenshot_size': {}, 'screenshot_file': f'{pid}.png', 
                                'topic': res_ele['data']['source'] , 
                                'url': res_ele['data']['url'], 
                                'language': res_ele['data']['language']}
        for res in results:
            if res['from_name'] == 'label':
                _id_answer = res['id'].split('_')[0]
                image_height = res['original_height']
                image_width = res['original_width']
                pid_user_annotations['screenshot_size'] = {'height': image_height, 'width': image_width}
                boundingbox_percentageofimage = {'height': res['value']['height'], 'width': res['value']['width'], 'x': res['value']['x'], 'y': res['value']['y']}
                if boundingbox_percentageofimage == {'height': 1, 'width': 1, 'x': 0, 'y':0}:
                    print(boundingbox_percentageofimage, id)      
                if boundingbox_percentageofimage['height'] == 1 and boundingbox_percentageofimage['width'] ==1:
                    print(boundingbox_percentageofimage, id)         
                polygon_image = get_polygon(boundingbox_percentageofimage, image_height, image_width)
                tagType = res['value']['rectanglelabels'][0]
                
                hyuIndex = False
                meta = res.get('meta')
                if meta:
                    hyuIndex = meta.get('text')
                    hyuIndex = hyuIndex[0].split(' ')[-1]
                    try: 
                        hyuIndex = int(hyuIndex)
                    except:
                        print(hyuIndex, meta)
                        print(pid, user)
                        hyuIndex = False
                        

                        
                if not hyuIndex: 
                    try:
                        # get hyuindex from id (pid_id_tagtype)
                        hyuIndex = int(res['id'].split('_')[1])
                    except: 
                        print(pid, user)
                        print(_id_answer)
                            
                res_annot = {'polygon': polygon_image, 'tagType': tagType, 'hyuIndex': int(hyuIndex)}
                
                # check if not already in it / remove duplications
                if res_annot not in pid_user_annotations['annotation'] and res_annot not in pid_user_annotations['digilog_annotation']:
                    if len(tagType) == 1:
                        pid_user_annotations['digilog_annotation'].append(res_annot)
                    else: 
                        pid_user_annotations['annotation'].append(res_annot)
                        
            elif res['from_name'] == 'language':
                pid_user_annotations['language'] = res['value']['text'][0]
        final_results.append(pid_user_annotations)
    
    # pprint(final_results)
    with open(f'our_dataset_benchmark/data/{res_name}.json', 'w') as outfile:
        json.dump(final_results, outfile)
    
            

def change_topics(input_file, output_file=None):
    """
    Change topics in the annotations of a JSON file and optionally save the modified annotations to a new file.
    This function reads a JSON file containing annotations, modifies the 'topic' field of each annotation according to
    a predefined mapping, and prints statistics about the new topics. If an output file is specified, the modified
    annotations are saved to that file; otherwise, they overwrite the input file.
    Args:
        input_file (str): Path to the input JSON file containing annotations.
        output_file (str, optional): Path to the output JSON file to save modified annotations. If not provided, the
                                     input file will be overwritten.
    Raises:
        FileNotFoundError: If the input file does not exist.
        json.JSONDecodeError: If the input file is not a valid JSON.
    """
    
    with open(input_file , 'r') as f:
        annotations = json.load(f)
    
    new_topics = {
        'hospitals': 'hospital', 
        'ensurances': 'insurance',
        'courts': 'court',
        'universities': 'university',
        'MCT': {'1': 'municipality', '0': 'tourism_other'},
    }
    for annot in annotations:
        topic, lang, classification = annot['topic'].split('_')
        if topic == 'MCT':
            annot['topic'] = new_topics[topic][lang]
        else:
            annot['topic'] = new_topics[topic]

    topic_counts = {}
    for annot in annotations:
        topic = annot['topic']
        if topic in topic_counts:
            topic_counts[topic] += 1
        else:
            topic_counts[topic] = 1

    print("Topic statistics:")
    for topic, count in topic_counts.items():
        print(f"{topic}: {count}")
        
    if output_file is None:
        output_file = input_file
    with open(output_file, 'w') as outfile:
        json.dump(annotations, outfile)
        

def clean_annotations(path):
    """
    Cleans annotation data from a JSON file.
    This function performs the following operations:
    1. Loads annotation data from a JSON file.
    2. Iterates through each annotation entry and performs the following checks and modifications:
        - Sets any polygon points with negative coordinates to 0.
        - Removes polygons with an area of 0.
        - Checks if any polygon points are outside the image boundaries.
    3. Prints a summary of the changes made.
    4. Saves the cleaned annotation data to a new JSON file.
    Args:
        path (str): The file path to the JSON file containing the annotation data.
    """
    
    with open(path, 'r') as file:
        data = json.load(file)
    counter_removed_polygons = 0
    counter_polygons = 0
    counter_over_page = 0
    set_to_0_counter = 0
    to_change = {}
    for index, entry in enumerate(data):
        pageid, user = entry["id"].split("_")
        user = f'{user}'
        
        # Get image size for pageid
        screenshot_path = f'our_dataset_benchmark/data/screenshots/{pageid}.png'
        if os.path.exists(screenshot_path):
            with Image.open(screenshot_path) as img:
                width, height = img.size
        else:
            print(f"Screenshot {screenshot_path} does not exist.")
        
        # go through each segment
        for idx_segment, segment in enumerate(entry['annotation']):
            polygon = segment['polygon']
            # put any below 0 to 0
            if any(p[0] < 0 or p[1] < 0 for p in polygon):
                # print(f"Warning: Polygon point {polygon} has a coordinate below 0.")
                polygon = [[max(0, p[0]), max(0, p[1])] for p in polygon]
                data[index]['annotation'][idx_segment]['polygon'] = polygon
                set_to_0_counter += 1
             
            
            # Check if the area of the polygon is greater than 0
            area = 0
            n = len(polygon)
            for i in range(n):
                x1, y1 = polygon[i]
                x2, y2 = polygon[(i + 1) % n]
                area += x1 * y2 - x2 * y1
            area = abs(area) / 2.0

            if area <= 0:
                
                counter_removed_polygons += 1
                # print(pageid, 'area = 0')
                data[index]['annotation'].pop(idx_segment)
                name = 'area_0'
                if pageid not in to_change:
                    to_change[pageid] = [(name, user)]
                else: 
                    to_change[pageid].append((name, user))
            # check if point isnt outside of image
            if any(int(p[0]) > width or int(p[1]) > height for p in polygon):
                
                name = 'greater_image'
                if pageid not in to_change:
                    to_change[pageid] = [(name, user, polygon, width, height)]
                else: 
                    to_change[pageid].append((name, user, polygon, width, height))                
                counter_over_page += 1
                
            counter_polygons += 1
    
    
    # pprint(to_change)
    for i, key in enumerate(to_change):
        print(f'{i}/{len(to_change)}\t {key} : ')
        pprint(to_change[key])
        pyperclip.copy(key)
        input()
        
    print(len(to_change))
    print('Removed polygons area is <= 0:', counter_removed_polygons ,'/', counter_polygons)
    print('Set to 0:', set_to_0_counter, '/', counter_polygons)
    print('over page:', counter_over_page)
    print('saved to: ', 'our_dataset_benchmark/data/cleaned_annotations.json')
    
    with open('our_dataset_benchmark/data/cleaned_annotations.json', 'w') as outfile:
        json.dump(data, outfile)
        
        
def make_boundingboxes_for_samenode_the_first_of_annotaters(input_path):
    """
    Processes a JSON file containing annotations and ensures that for each page and hyuIndex,
    the bounding box (polygon) is consistent with the first occurrence of that hyuIndex on the page.
    """
    
    with open(input_path, 'r') as file:
        data = json.load(file)
    
    boundingboxes_saved = {}
    for index, entry in enumerate(data):
        pageid, user = entry["id"].split("_")
        user = f'{user}'
        if pageid not in  boundingboxes_saved:
            boundingboxes_saved[pageid] = {}
        
        for idx_segment, segment in enumerate(entry['annotation']):
            polygon = segment['polygon']
            hyu = segment['hyuIndex']
            if hyu not in boundingboxes_saved[pageid]:
                boundingboxes_saved[pageid][hyu] = polygon
            else:
                # overwrite with first:
                print('overwriting with first:', pageid, hyu)
                data[index]['annotation'][idx_segment]['polygon'] = boundingboxes_saved[pageid][hyu]

    with open(input_path, 'w') as outfile:
        json.dump(data, outfile)
        

    
def combine_stored_answers(res_folder, answers_file_name):
    df_stored = pd.read_csv(os.path.join(res_folder, 'Webpage.csv'))
    df_stored['pid'] = df_stored['_id'].str.extract(r'ObjectId\("(.+)"\)')
    pid_url_source_map = df_stored.set_index('pid')[['url', 'source']].to_dict('index')
    
    df_answers = pd.read_csv(os.path.join(res_folder, answers_file_name))
    # drop nan values
    df_answers = df_answers.dropna()
    
    # Step 1: Extract the string value from the ObjectId fields
    df_answers['_id'] = df_answers['_id'].str.extract(r'ObjectId\("(.+)"\)')
    df_answers['pid'] = df_answers['pid'].str.extract(r'ObjectId\("(.+)"\)')
    df_answers['boundingBox'] = df_answers['boundingBox'].apply(ast.literal_eval)
    df_answers['hyuIndex'] = df_answers['hyuIndex'].astype(int)
    
    return df_answers, pid_url_source_map

def prep_for_labelstudio_all(res_folder:str, png_folder:str, answers_file_name:str):
    """
    Perform cropping or overlay of segments on all Stored Pages.
    Args:
        res_folder (str): The path to the folder containing the Answer.csv and Stored.csv from the mongo Db.
        png_folder (str): The path to the folder containing the PNG files.
        png_col (str): The column name of the PNG files.
        do (str): The operation to be performed on the segments ['crop' or 'overlay'].
        filter_userid (str, optional): The user ID to filter the answers. Defaults to None.
    """   
    df_answers, pid_url_source_map = combine_stored_answers(res_folder, answers_file_name)  

    json_data = []
    
    users = df_answers['userId'].unique()

    df_answers['source_url'] = df_answers['pid'].map(pid_url_source_map)
    df_answers['source'] = df_answers['source_url'].apply(lambda x: x['source'] if isinstance(x, dict) else None)
    df_answers['url'] = df_answers['source_url'].apply(lambda x: x['url'] if isinstance(x, dict) else None)
    
    # Drop rows where source is na
    df_answers = df_answers.dropna(subset=['source'])
    
    # filter for specific sources: 
    df_answers = df_answers[~df_answers['source'].str.contains('test')]
    

    # print unique sources
    print(df_answers['source'].unique())
    
    for user in ['gerj', 'rabi', 'saxr', 'bapt']:
        print(f'Processing user {user}')
        df_answers_user = df_answers[df_answers['userId'] == user]
        df_grouped_user = df_answers_user.groupby('pid')
        
        for pid, group in df_grouped_user:
    
            # url_source = pid_url_source_map.get(pid)  
            image_path = os.path.join(png_folder, pid + '.png')
            if os.path.exists(image_path):
                pass
            else:
                print(f'Image {image_path} does not exist')
                continue
            image = Image.open(image_path)
            
            original_width, original_height = image.size
            result = []
            
            for _, row in group.iterrows():
                bounding_box = row['boundingBox']

                x = bounding_box['x'] / original_width * 100
                y = bounding_box['y'] / original_height * 100
                width = bounding_box['width'] / original_width * 100
                height = bounding_box['height'] / original_height * 100
                
                # adjust for maximum 100 ...
                x_o, y_o, w_o, h_o = x, y, width, height
                x, width = adjust_for_min_max(x, width)
                y, height = adjust_for_min_max(y, height)
                
                if x != x_o or y != y_o or width != w_o  or height != h_o:
                    print('before: ', x_o, w_o, y_o, h_o)
                    print('after: ', x,width,  y, height)
                
                label = row['tagType']
                user = row['userId']
                
                result.append(
                            {
                                "original_width": original_width,
                                "original_height": original_height,
                                "image_rotation": 0,
                                "value": {
                                    "x": x,
                                    "y": y,
                                    "width": width,
                                    "height": height,
                                    "rotation": 0,
                                    "rectanglelabels": [label]
                                },
                                "id": row['_id'],
                                "from_name": "label",
                                "to_name": "image",
                                "type": "rectanglelabels",
                                "hyuIndex": row['hyuIndex']
                            }
                        )
                
            json_data.append({
                "data": {
                    "image": f"/data/local-files/?d=git/main-content-extraction-assessment-framework/src/project/api/downloads/screenshots/{pid}.png",
                    "source": row['source'],
                    "url": row['url'],
                    "user": user, 
                    "pid": pid
                },
                
                "predictions": [
                    {
                        "result": result
                    }
                ]
            })
            
    print('data json length', len(json_data))
    with open(os.path.join(res_folder, f'{answers_file_name[:-4]}_toaddtolibrestudio.json'), 'w') as f:
        json.dump(json_data, f, indent=4)

def adjust_for_min_max(x, width):
    
    #  adjust min
    if x < 0:
        x = 0
    if width == 0:
        width = 1
    
    total = x + width
    if total > 100:
        factor = 100/ total
        x = x * factor
        width = width * factor
    
    return x, width 
        

if '__main__' == __name__:

    
    ## Prepare Data from Chrome Extension for Labelstudio
    prep_for_labelstudio_all('WebSegDig/data', 'src/project/api/downloads/screenshots', 'Answer.csv')

    ## Prep Data From Labelstudio for BCubed Calculations
    change_format_from_labelstudio('labelstudio.json', 'annotations')
    clean_annotations('our_dataset_benchmark/data/annotations.json')
    check_final_stats('cleaned_annotations')
    make_boundingboxes_for_samenode_the_first_of_annotaters('our_dataset_benchmark/data/cleaned_annotations.json')
    change_topics('our_dataset_benchmark/data/WebClasSeg25/annotations.json')
    